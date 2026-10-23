/**
 * Runs a game inside a room: awaits prepareRound, applies init/reduce/onTimer/hooks,
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
  type PrepareRequest,
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
  /** Logged at start, so a bug report can be matched to the game's random draws. */
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
    const seed = randomInt(2 ** 31)
    const game: RunningGame = { module, state: undefined, rng: createRng(seed), seed, timers: new Map() }
    const prepared = await this.prepare(room, game, { trigger: 'init' })
    const result = this.guard(room, 'init', () => module.init({ ...this.ctx(room, game), prepared }))
    room.game = game
    room.phase = 'playing'
    this.deps.logger.info('game started', { room: room.code, game: module.id, players: room.players.length, seed })
    this.apply(room, game, result)
  }

  /** A player action from the `action` envelope. */
  async action(room: Room, actorId: string, rawAction: unknown): Promise<void> {
    const game = room.game
    if (!game) return
    const parsed = game.module.actionSchema.safeParse(rawAction)
    if (!parsed.success) throw new RoomError('validation', 'That move is not valid')
    const action = parsed.data
    const prepared = await this.prepare(room, game, { trigger: 'action', state: game.state, action, actorId })
    if (room.game !== game) return // the game ended while prepareRound was running
    const result = this.guard(room, 'reduce', () =>
      game.module.reduce(game.state, action, { ...this.ctx(room, game), actorId, prepared }),
    )
    if (isGameError(result)) throw new RoomError('game', result.error)
    this.apply(room, game, result)
  }

  /** A scheduled timer action that is due. */
  private async timer(room: Room, game: RunningGame, action: unknown): Promise<void> {
    const onTimer = game.module.onTimer
    if (!onTimer) throw new Error(`game ${game.module.id} scheduled a timer but has no onTimer`)
    const prepared = await this.prepare(room, game, { trigger: 'timer', state: game.state, action })
    if (room.game !== game) return
    const result = this.guard(room, 'onTimer', () =>
      onTimer.call(game.module, game.state, action, { ...this.ctx(room, game), prepared }),
    )
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
              await this.timer(room, game, effect.action)
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

  private prepare(room: Room, game: RunningGame, request: PrepareRequest<unknown, unknown, unknown>): Promise<unknown> {
    const { module } = game
    if (!module.prepareRound) return Promise.resolve(undefined)
    return module.prepareRound(request, {
      settings: room.settings,
      players: this.deps.playerInfos(room),
      services: this.deps.servicesFor(module),
    })
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
