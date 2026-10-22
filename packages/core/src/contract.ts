/**
 * The server-side game contract. A game is a pure reducer plus optional
 * integrations; the core owns rooms, sockets, timers and I/O.
 *
 * Purity rules for init / reduce / view / lifecycle hooks:
 * - no I/O, no Math.random, no Date.now, no setTimeout
 * - use ctx.rng, ctx.now, and data from prepareRound instead
 * - return new state; timers and notices are returned as effects
 *
 * The core only ever sends view(state, viewerId) to clients, never raw state.
 */
import type { Router } from 'express'
import type { DatabaseSync } from 'node:sqlite'
import type { ZodObject, ZodType } from 'zod'
import type { CategoryService } from './categories.ts'
import type { Rng } from './rng.ts'

export type PlayerId = string

/** Players in join order. `connected` reflects the socket state right now. */
export interface PlayerInfo {
  id: PlayerId
  name: string
  connected: boolean
  isLoggedIn: boolean
}

export interface BaseCtx<Settings> {
  players: readonly PlayerInfo[]
  settings: Settings
  hostId: PlayerId
  /** Milliseconds since epoch, fixed for the duration of one call. */
  now: number
  rng: Rng
}

export interface InitCtx<Settings, P = undefined> extends BaseCtx<Settings> {
  /** Output of prepareRound({ trigger: 'init' }), or undefined if the game has none. */
  prepared: P | undefined
}

export interface ReduceCtx<Settings, P = undefined> extends BaseCtx<Settings> {
  /** Who sent the action. `null` means the core itself (a scheduled effect firing). */
  actorId: PlayerId | null
  /** Output of prepareRound({ trigger: 'action', ... }) for this action, if any. */
  prepared: P | undefined
}

export type HookCtx<Settings> = BaseCtx<Settings>

/** Recipients for a notice. 'host' resolves to the current host when sent. */
export type NoticeTarget = PlayerId | PlayerId[] | 'all' | 'host'

export type Effect<A> =
  /** Dispatch `action` (with actorId null) at time `at`. Re-scheduling a key replaces it. */
  | { type: 'schedule'; key: string; at: number; action: A }
  | { type: 'cancel'; key: string }
  | { type: 'notice'; to: NoticeTarget; message: string }
  /** End the game and return the room to the lobby. */
  | { type: 'gameOver' }

export interface Transition<S, A> {
  state: S
  effects?: Effect<A>[]
}

/** Returned by reduce() to reject an action; sent to the actor as error { code: 'game' }. */
export interface GameError {
  error: string
}

export function gameError(message: string): GameError {
  return { error: message }
}

export function isGameError(value: unknown): value is GameError {
  return typeof value === 'object' && value !== null && 'error' in value && !('state' in value)
}

/**
 * A secret value in game state and who may see it.
 *
 * The leak harness checks two things for every viewer that may NOT see the secret:
 * - `values`: no string (value or object key) in the viewer's view equals one of these,
 *   compared trimmed and case-insensitively. Use for text like a secret word.
 * - `variants`: the viewer's view is identical across states that differ only in
 *   this secret. Use for associations that a plain string search can't catch,
 *   like which player id is the imposter. Variants are built per viewer, so they can
 *   keep that viewer's own data (e.g. their own vote) fixed.
 */
export interface SecretDef<S> {
  name: string
  visibleTo(state: S, viewerId: PlayerId): boolean
  values?(state: S): string[]
  variants?(state: S, viewerId: PlayerId): S[]
}

export type SecretSpec<S> = SecretDef<S>[]

/** A migration for games.db. Tables must be prefixed with `<gameId>_`. */
export interface Migration {
  /** Unique within the game and never renamed, e.g. '001_words'. Recorded as `<gameId>:<id>`. */
  id: string
  sql: string
}

/** The signed-in admin, as `res.locals.user` inside a game's adminRouter. */
export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'admin'
}

export interface Logger {
  info(message: string, extra?: Record<string, unknown>): void
  warn(message: string, extra?: Record<string, unknown>): void
  error(message: string, extra?: Record<string, unknown>): void
}

export interface AiToolSpec<T> {
  name: string
  description: string
  inputSchema: ZodType<T>
}

export type AiErrorCode = 'cap' | 'rate_limited' | 'invalid' | 'refused' | 'api'

/**
 * Thrown by AiService.generate. 'cap': the daily output-token cap is used up.
 * 'rate_limited': this admin's hourly limit (or Anthropic's). 'invalid': the
 * model didn't return a valid tool call. 'refused': the model declined.
 * 'api': any other API/network failure.
 */
export class AiError extends Error {
  readonly code: AiErrorCode
  constructor(code: AiErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/** Shared AI service, already bound to the calling game's id. */
export interface AiService {
  generate<T>(request: { userId: string | null; system: string; prompt: string; tool: AiToolSpec<T> }): Promise<T>
}

/** Services the core hands to a game's integrations (never to init/reduce/view). */
export interface ServerServices {
  gameId: string
  /**
   * games.db handle (WAL, busy_timeout, foreign keys on). Write only to tables
   * prefixed with `<gameId>_`. The core `categories` table may be read and joined
   * (always filtered by game_id = gameId) and referenced by foreign key; change
   * it through `categories`.
   */
  db: DatabaseSync
  /**
   * null when ANTHROPIC_API_KEY is unset (hide generation features), and always
   * null outside adminRouter/mcpTools: gameplay and public routes never get AI.
   */
  ai: AiService | null
  /** Writes to stderr, so it is safe inside the stdio MCP process. */
  logger: Logger
  /** This game's rows in the shared categories table. */
  categories: CategoryService
}

/** An MCP tool, independent of the MCP SDK. Registered as `<gameId>_<name>`. */
export interface McpToolDef<Args = unknown> {
  name: string
  description: string
  inputSchema: ZodObject
  handler(args: Args): Promise<unknown>
}

export type PrepareRequest<S, A> =
  | { trigger: 'init' }
  | { trigger: 'action'; state: S; action: A; actorId: PlayerId | null }

export interface GameModule<S, A, V, Settings, P = undefined> {
  /** Lowercase letters and digits, starting with a letter. Used for routes, tables and MCP tools. */
  id: string
  name: string
  description: string
  minPlayers: number
  maxPlayers: number
  settingsSchema: ZodType<Settings>
  defaultSettings: Settings
  actionSchema: ZodType<A>

  init(ctx: InitCtx<Settings, P>): Transition<S, A>
  reduce(state: S, action: A, ctx: ReduceCtx<Settings, P>): Transition<S, A> | GameError
  /** Per-player snapshot; the only game data that leaves the server. Must be JSON-serializable. */
  view(state: S, viewerId: PlayerId): V

  onPlayerDisconnected?(state: S, playerId: PlayerId, ctx: HookCtx<Settings>): Transition<S, A>
  onPlayerReconnected?(state: S, playerId: PlayerId, ctx: HookCtx<Settings>): Transition<S, A>
  onPlayerRemoved?(state: S, playerId: PlayerId, ctx: HookCtx<Settings>): Transition<S, A>

  secrets?: SecretSpec<S>

  migrations?: Migration[]
  /**
   * Mounted at /api/admin/<id>, already behind requireAdmin and the Origin check.
   * JSON bodies are parsed. `res.locals.user` is the signed-in admin (AdminUser).
   */
  adminRouter?(services: ServerServices): Router
  /** Read-only data for players (e.g. lobby pickers). Mounted at /api/games/<id>; the core only lets GET through. */
  publicRouter?(services: ServerServices): Router
  mcpTools?(services: ServerServices): McpToolDef[]
  /**
   * Set if the game uses the shared categories table. The core then serves
   * /api/admin/categories/<id> (list/create/rename/delete) and shows a
   * Categories admin page; `usage` returns how many items use each category id.
   */
  categories?: { usage(services: ServerServices): Record<number, number> }
  /**
   * Async I/O step the runner awaits before init and before every action
   * (including scheduled ones). Return undefined when the action needs nothing.
   * Its result reaches init/reduce as ctx.prepared, so they stay pure.
   */
  prepareRound?(
    request: PrepareRequest<S, A>,
    ctx: { settings: Settings; players: readonly PlayerInfo[]; services: ServerServices },
  ): Promise<P | undefined>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameModule = GameModule<any, any, any, any, any>

/** Identity helper so a game module's type parameters are inferred. */
export function defineGame<S, A, V, Settings, P = undefined>(
  game: GameModule<S, A, V, Settings, P>,
): GameModule<S, A, V, Settings, P> {
  return game
}

export const GAME_ID_PATTERN = /^[a-z][a-z0-9]{0,31}$/
/** Hard cap on players per room, whatever a game declares. */
export const MAX_PLAYERS_CAP = 12

/** Checks a registry entry at boot. Throws with a readable message on the first problem. */
export function assertValidGame(game: AnyGameModule): void {
  const where = `game "${game.id}"`
  if (!GAME_ID_PATTERN.test(game.id)) {
    throw new Error(`${where}: id must match ${GAME_ID_PATTERN}`)
  }
  if (!Number.isInteger(game.minPlayers) || game.minPlayers < 1) {
    throw new Error(`${where}: minPlayers must be an integer >= 1`)
  }
  if (!Number.isInteger(game.maxPlayers) || game.maxPlayers < game.minPlayers || game.maxPlayers > MAX_PLAYERS_CAP) {
    throw new Error(`${where}: maxPlayers must be an integer between minPlayers and ${MAX_PLAYERS_CAP}`)
  }
  const settings = game.settingsSchema.safeParse(game.defaultSettings)
  if (!settings.success) {
    throw new Error(`${where}: defaultSettings fail settingsSchema: ${settings.error.message}`)
  }
  const migrationIds = new Set<string>()
  for (const m of game.migrations ?? []) {
    if (migrationIds.has(m.id)) throw new Error(`${where}: duplicate migration id "${m.id}"`)
    migrationIds.add(m.id)
  }
}

/** Checks the whole registry: each game valid, ids unique. */
export function assertValidRegistry(games: readonly AnyGameModule[]): void {
  if (games.length === 0) throw new Error('game registry is empty')
  const ids = new Set<string>()
  for (const game of games) {
    assertValidGame(game)
    if (ids.has(game.id)) throw new Error(`duplicate game id "${game.id}"`)
    ids.add(game.id)
  }
}
