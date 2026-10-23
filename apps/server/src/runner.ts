/**
 * Runs a game inside a room: awaits prepareRound, applies init/reduce/hooks,
 * executes effects (timers, notices, gameOver), and builds per-player views.
 * Raw game state never leaves this file; clients only get view() output.
 * Every call here happens on the room's queue (see RoomManager.enqueue).
 */
import { randomInt } from 'node:crypto'
import {
  isGameError,
  type AnyGameModule,
  type Effect,
  type PlayerInfo,
  type ServerServices,
  type Transition,
} from '@wsfg/core/contract'
import { createRng, type Rng } from '@wsfg/core/rng'
import type { AppLogger } from './logger.ts'
import type { Clock, TimerHandle } from './clock.ts'
import { RoomError } from './errors.ts'
import type { Room } from './rooms.ts'

export interface RunningGame {
  module: AnyGameModule
  state: unknown
  rng: Rng
  /** Recorded so a round can be replayed when debugging. */
  seed: number
  timers: Map<string, TimerHandle>
}

export interface RunnerDeps {
  clock: Clock
  logger: AppLogger
  servicesFor: (game: AnyGameModule) => ServerServices
  enqueue: (room: Room, fn: () => void | Promise<void>) => Promise<void>
  notify: (room: Room, playerIds: string[], message: string) => void
  playerInfos: (room: Room) => PlayerInfo[]
  endGame: (room: Room) => void
}

type HookName = 'onPlayerDisconnected' | 'onPlayerReconnected' | 'onPlayerRemoved'

const GAME_BUG = 'Something went wrong in the game'

export class GameRunner {
  private readonly deps: RunnerDeps

  constructor(deps: RunnerDeps) {
    this.deps = deps
  }

  async start(room: Room, module: AnyGameModule): Promise<void> {
    const prepared = module.prepareRound
      ? await module.prepareRound(
          { trigger: 'init' },
          { settings: room.settings, players: this.deps.playerInfos(room), services: this.deps.servicesFor(module) },
        )
      : undefined
    const seed = randomInt(2 ** 31)
    const game: RunningGame = { module, state: undefined, rng: createRng(seed), seed, timers: new Map() }
    const result = this.guard(room, 'init', () => module.init({ ...this.ctx(room, game), prepared }))
    room.game = game
    room.phase = 'playing'
    this.apply(room, game, result)
  }

  /** A player action from the `action` envelope. actorId null = a scheduled effect firing. */
  async action(room: Room, actorId: string | null, rawAction: unknown): Promise<void> {
    const game = room.game
    if (!game) return
    let action = rawAction
    if (actorId !== null) {
      const parsed = game.module.actionSchema.safeParse(rawAction)
      if (!parsed.success) throw new RoomError('validation', 'That move is not valid')
      action = parsed.data
    }
    const prepared = game.module.prepareRound
      ? await game.module.prepareRound(
          { trigger: 'action', state: game.state, action, actorId },
          { settings: room.settings, players: this.deps.playerInfos(room), services: this.deps.servicesFor(game.module) },
        )
      : undefined
    if (room.game !== game) return // the game ended while prepareRound was running
    const result = this.guard(room, 'reduce', () =>
      game.module.reduce(game.state, action, { ...this.ctx(room, game), actorId, prepared }),
    )
    if (isGameError(result)) {
      if (actorId === null) return // a stale or rejected timer action is simply dropped
      throw new RoomError('game', result.error)
    }
    this.apply(room, game, result)
  }

  /** Player lifecycle hooks. Failures are logged, never thrown at the player. */
  hook(room: Room, name: HookName, playerId: string): void {
    const game = room.game
    const hook = game?.module[name]
    if (!game || !hook) return
    try {
      this.apply(room, game, hook.call(game.module, game.state, playerId, this.ctx(room, game)))
    } catch (error) {
      this.deps.logger.error(`game ${name} failed`, { room: room.code, error: errorText(error) })
    }
  }

  /** The game's view for one player, or null in the lobby. */
  view(room: Room, playerId: string): unknown {
    const game = room.game
    if (!game) return null
    try {
      return game.module.view(game.state, playerId)
    } catch (error) {
      this.deps.logger.error('game view failed', { room: room.code, error: errorText(error) })
      return null
    }
  }

  /** Cancel all timers and drop the game (back to the lobby or room closed). */
  stop(room: Room): void {
    if (!room.game) return
    for (const timer of room.game.timers.values()) timer.cancel()
    room.game = null
  }

  // ---- internals

  private apply(room: Room, game: RunningGame, result: Transition<unknown, unknown>): void {
    game.state = result.state
    for (const effect of result.effects ?? []) this.run(room, game, effect)
  }

  private run(room: Room, game: RunningGame, effect: Effect<unknown>): void {
    switch (effect.type) {
      case 'schedule': {
        game.timers.get(effect.key)?.cancel()
        const timer = this.deps.clock.setTimeout(() => {
          void this.deps
            .enqueue(room, async () => {
              // Checked on the queue, not when the clock fires: work queued ahead of
              // this may have cancelled or replaced the key, and then it must not run.
              if (room.game !== game || game.timers.get(effect.key) !== timer) return
              game.timers.delete(effect.key)
              await this.action(room, null, effect.action)
            })
            .catch((error) => this.deps.logger.error('scheduled action failed', { error: errorText(error) }))
        }, effect.at - this.deps.clock.now())
        game.timers.set(effect.key, timer)
        return
      }
      case 'cancel':
        game.timers.get(effect.key)?.cancel()
        game.timers.delete(effect.key)
        return
      case 'notice': {
        const to =
          effect.to === 'all'
            ? room.players.map((p) => p.id)
            : effect.to === 'host'
              ? [room.hostId]
              : Array.isArray(effect.to)
                ? effect.to
                : [effect.to]
        this.deps.notify(room, to, effect.message)
        return
      }
      case 'gameOver':
        this.deps.endGame(room)
        return
    }
  }

  private ctx(room: Room, game: RunningGame) {
    return {
      players: this.deps.playerInfos(room),
      settings: room.settings,
      hostId: room.hostId,
      now: this.deps.clock.now(),
      rng: game.rng,
    }
  }

  private guard<T>(room: Room, what: string, fn: () => T): T {
    try {
      return fn()
    } catch (error) {
      this.deps.logger.error(`game ${what} failed`, { room: room.code, error: errorText(error) })
      throw new RoomError('game', GAME_BUG)
    }
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}
