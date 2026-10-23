/**
 * A synchronous, in-memory stand-in for the room runner, for game tests.
 * It applies init/reduce/onTimer/hooks, executes effects against a virtual clock,
 * and exposes per-player views. No sockets, no DB: `prepare` replaces the
 * game's async prepareRound with a synchronous fake.
 */
import type {
  GameModule,
  HookCtx,
  PlayerId,
  PlayerInfo,
  PrepareRequest,
  Transition,
} from '../contract.ts'
import { isGameError } from '../contract.ts'
import { createRng, type Rng } from '../rng.ts'

export interface SimPlayer {
  id: PlayerId
  name?: string
  isLoggedIn?: boolean
  connected?: boolean
}

export interface SimOptions<S, A, T, Settings, P> {
  /** In join order. */
  players: SimPlayer[]
  /** Defaults to the first player. */
  hostId?: PlayerId
  /** Defaults to the game's defaultSettings. Validated with settingsSchema. */
  settings?: Settings
  seed?: number
  /** Virtual clock start, ms. Defaults to 0. */
  now?: number
  /** Synchronous stand-in for prepareRound. */
  prepare?: (request: PrepareRequest<S, A, T>) => P | undefined
}

export interface SimNotice {
  to: PlayerId[]
  message: string
}

export type ActResult = { ok: true } | { ok: false; error: string }

export class GameSim<S, A, T, V, Settings, P = undefined> {
  state: S
  players: PlayerInfo[]
  hostId: PlayerId
  now: number
  readonly settings: Settings
  /** Pending scheduled actions by key, in scheduling order. */
  readonly timers = new Map<string, { at: number; action: T }>()
  readonly notices: SimNotice[] = []
  /** True once the game emitted gameOver; further actions are rejected. */
  over = false

  readonly game: GameModule<S, A, T, V, Settings, P>
  private readonly rng: Rng
  private readonly prepare: ((request: PrepareRequest<S, A, T>) => P | undefined) | undefined

  constructor(game: GameModule<S, A, T, V, Settings, P>, options: SimOptions<S, A, T, Settings, P>) {
    this.game = game
    if (options.players.length === 0) throw new Error('GameSim: at least one player is required')
    this.players = options.players.map((p) => ({
      id: p.id,
      name: p.name ?? p.id,
      isLoggedIn: p.isLoggedIn ?? false,
      connected: p.connected ?? true,
    }))
    this.hostId = options.hostId ?? this.players[0]!.id
    this.settings = game.settingsSchema.parse(options.settings ?? game.defaultSettings)
    this.now = options.now ?? 0
    this.rng = createRng(options.seed ?? 1)
    this.prepare = options.prepare

    // apply() would set this.state too; TS needs to see it assigned here.
    const result = game.init({ ...this.baseCtx(), prepared: this.prepare?.({ trigger: 'init' }) })
    this.state = result.state
    this.apply(result)
  }

  /** A player action. Validated with actionSchema, like the core does. */
  act(actorId: PlayerId, action: unknown): ActResult {
    if (this.over) return { ok: false, error: 'game is over' }
    if (!this.players.some((p) => p.id === actorId)) return { ok: false, error: `unknown player ${actorId}` }
    const parsed = this.game.actionSchema.safeParse(action)
    if (!parsed.success) return { ok: false, error: `validation: ${parsed.error.message}` }
    const prepared = this.prepare?.({ trigger: 'action', state: this.state, action: parsed.data, actorId })
    const result = this.game.reduce(this.state, parsed.data, { ...this.baseCtx(), actorId, prepared })
    if (isGameError(result)) return { ok: false, error: result.error }
    this.apply(result)
    return { ok: true }
  }

  /** Fire every timer due up to now + ms, in time order, then set the clock to now + ms. */
  advance(ms: number): void {
    const target = this.now + ms
    for (let next = this.nextTimer(); next && next.at <= target; next = this.nextTimer()) {
      this.fire(next.key)
    }
    this.now = Math.max(this.now, target)
  }

  /** Fire the earliest pending timer, moving the clock forward to it. Returns its key, or null. */
  fireNext(): string | null {
    const next = this.nextTimer()
    if (!next) return null
    this.fire(next.key)
    return next.key
  }

  /** A player joins mid-game (appended in join order). The game sees them in ctx.players from now on. */
  join(player: SimPlayer): void {
    if (this.players.some((p) => p.id === player.id)) throw new Error(`GameSim: ${player.id} already joined`)
    this.players = [
      ...this.players,
      { id: player.id, name: player.name ?? player.id, isLoggedIn: player.isLoggedIn ?? false, connected: player.connected ?? true },
    ]
  }

  disconnect(playerId: PlayerId): void {
    this.setConnected(playerId, false)
    this.runHook(this.game.onPlayerDisconnected, playerId)
  }

  reconnect(playerId: PlayerId): void {
    this.setConnected(playerId, true)
    this.runHook(this.game.onPlayerReconnected, playerId)
  }

  /** Remove a player (kick/leave). If they were host, host passes to the next player in join order. */
  remove(playerId: PlayerId): void {
    this.players = this.players.filter((p) => p.id !== playerId)
    if (this.hostId === playerId && this.players[0]) this.hostId = this.players[0].id
    this.runHook(this.game.onPlayerRemoved, playerId)
  }

  setHost(playerId: PlayerId): void {
    this.hostId = playerId
  }

  view(viewerId: PlayerId): V {
    return this.game.view(this.state, viewerId)
  }

  /** Notices sent to one player so far. */
  noticesFor(playerId: PlayerId): string[] {
    return this.notices.filter((n) => n.to.includes(playerId)).map((n) => n.message)
  }

  private fire(key: string): void {
    const timer = this.timers.get(key)
    if (!timer || this.over) return
    this.timers.delete(key)
    this.now = Math.max(this.now, timer.at)
    const onTimer = this.game.onTimer
    if (!onTimer) throw new Error(`GameSim: ${this.game.id} scheduled a timer but has no onTimer`)
    const prepared = this.prepare?.({ trigger: 'timer', state: this.state, action: timer.action })
    this.apply(onTimer.call(this.game, this.state, timer.action, { ...this.baseCtx(), prepared }))
  }

  private runHook(
    hook: ((state: S, playerId: PlayerId, ctx: HookCtx<Settings>) => Transition<S, T>) | undefined,
    playerId: PlayerId,
  ): void {
    if (!hook || this.over) return
    this.apply(hook.call(this.game, this.state, playerId, this.baseCtx()))
  }

  private apply(result: Transition<S, T>): void {
    this.state = result.state
    for (const effect of result.effects ?? []) {
      switch (effect.type) {
        case 'schedule':
          this.timers.delete(effect.key) // re-scheduling moves the key to the end
          this.timers.set(effect.key, { at: effect.at, action: effect.action })
          break
        case 'cancel':
          this.timers.delete(effect.key)
          break
        case 'notice': {
          const to =
            effect.to === 'all'
              ? this.players.map((p) => p.id)
              : effect.to === 'host'
                ? [this.hostId]
                : Array.isArray(effect.to)
                  ? effect.to
                  : [effect.to]
          this.notices.push({ to, message: effect.message })
          break
        }
        case 'gameOver':
          this.over = true
          this.timers.clear()
          break
      }
    }
  }

  private nextTimer(): { key: string; at: number } | null {
    let best: { key: string; at: number } | null = null
    for (const [key, { at }] of this.timers) {
      if (!best || at < best.at) best = { key, at }
    }
    return best
  }

  private setConnected(playerId: PlayerId, connected: boolean): void {
    this.players = this.players.map((p) => (p.id === playerId ? { ...p, connected } : p))
  }

  private baseCtx() {
    return {
      players: this.players,
      settings: this.settings,
      hostId: this.hostId,
      now: this.now,
      rng: this.rng,
    }
  }
}

export function createSim<S, A, T, V, Settings, P = undefined>(
  game: GameModule<S, A, T, V, Settings, P>,
  options: SimOptions<S, A, T, Settings, P>,
): GameSim<S, A, T, V, Settings, P> {
  return new GameSim(game, options)
}
