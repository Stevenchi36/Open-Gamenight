/**
 * WebSocket wire protocol: JSON messages `{ type, ...payload }`.
 * Every client message is validated with these schemas before the core acts on it.
 * Game actions travel inside the `action` envelope and are validated separately
 * with the game's own actionSchema; game settings with its settingsSchema.
 */
import { z } from 'zod'
import { GAME_ID_PATTERN, GAME_STYLES } from './contract.ts'

export const MAX_PAYLOAD_BYTES = 16 * 1024
export const NAME_MAX_LENGTH = 16
export const ROOM_CODE_LENGTH = 4
/** Codes are generated from this alphabet (no I or O, which read like 1 and 0). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
/** The viewer id spectators' views are built for. Player ids start with `p_`, so it never matches one. */
export const SPECTATOR_ID = 'spectator'
export const MAX_SPECTATORS = 8

// ---------------------------------------------------------------- fields

/** Display name: trimmed, 1-16 chars, no control characters. Uniqueness per room is checked by the core. */
export const displayName = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(NAME_MAX_LENGTH, `Name must be at most ${NAME_MAX_LENGTH} characters`)
  .regex(/^[^\p{Cc}]+$/u, 'Name contains invalid characters')

/** Room code: case-insensitive on input, normalized to upper case. */
export const roomCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[A-Z]{${ROOM_CODE_LENGTH}}$`), `Room code must be ${ROOM_CODE_LENGTH} letters`)

export const gameId = z.string().regex(GAME_ID_PATTERN, 'Unknown game')
export const playerId = z.string().min(1).max(64)
export const reconnectToken = z.string().min(16).max(128)

// ---------------------------------------------------------------- client -> server

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create_room'), gameId: gameId.optional(), name: displayName.optional() }),
  z.object({ type: z.literal('join_room'), code: roomCode, name: displayName }),
  z.object({ type: z.literal('reconnect'), code: roomCode, token: reconnectToken }),
  z.object({ type: z.literal('spectate_room'), code: roomCode }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('set_name'), name: displayName }),
  z.object({ type: z.literal('select_game'), gameId }),
  z.object({ type: z.literal('update_settings'), settings: z.unknown() }),
  z.object({ type: z.literal('start_game') }),
  z.object({ type: z.literal('return_to_lobby') }),
  z.object({ type: z.literal('transfer_host'), playerId }),
  z.object({ type: z.literal('kick'), playerId }),
  z.object({ type: z.literal('close_room') }),
  z.object({ type: z.literal('action'), action: z.unknown() }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>
export type ClientMessageType = ClientMessage['type']

export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: string }

/** Parses one raw websocket frame. Never throws. */
export function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Message is not valid JSON' }
  }
  const result = clientMessageSchema.safeParse(data)
  if (!result.success) return { ok: false, error: z.prettifyError(result.error) }
  return { ok: true, message: result.data }
}

// ---------------------------------------------------------------- server -> client

export const errorCodeSchema = z.enum([
  'unauthorized',
  'forbidden',
  'rate_limited',
  'room_cap',
  'validation',
  'not_found',
  'game',
])
export type ErrorCode = z.infer<typeof errorCodeSchema>

/** 'removed': you are no longer in the room (kicked, or the room closed); go back home. */
export const noticeKindSchema = z.enum(['info', 'warning', 'server_restarting', 'removed'])
export type NoticeKind = z.infer<typeof noticeKindSchema>

export const sessionUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['user', 'admin']),
})
export type SessionUser = z.infer<typeof sessionUserSchema>

export const roomPlayerSchema = z.object({
  id: playerId,
  name: z.string(),
  connected: z.boolean(),
  isHost: z.boolean(),
  isLoggedIn: z.boolean(),
})

export const availableGameSchema = z.object({
  id: gameId,
  name: z.string(),
  description: z.string(),
  styles: z.array(z.enum(GAME_STYLES)).readonly(),
  minPlayers: z.number().int(),
  maxPlayers: z.number().int(),
})

export const roomViewSchema = z.object({
  code: roomCode,
  phase: z.enum(['lobby', 'playing']),
  hostId: playerId,
  game: z.object({ id: gameId, name: z.string(), settings: z.unknown() }),
  availableGames: z.array(availableGameSchema),
  players: z.array(roomPlayerSchema),
  /** How many are watching on the watch page. */
  spectators: z.number().int(),
  /** SPECTATOR_ID on a spectator's connection. */
  you: z.object({ id: playerId }),
})

export type RoomView = z.infer<typeof roomViewSchema>
export type RoomPlayer = z.infer<typeof roomPlayerSchema>
export type AvailableGame = z.infer<typeof availableGameSchema>

export const serverMessageSchema = z.discriminatedUnion('type', [
  /** `build`: the id of the client build the server is serving (null in dev); a tab running another build reloads. */
  z.object({ type: z.literal('session'), user: sessionUserSchema.nullable(), build: z.string().nullable() }),
  z.object({ type: z.literal('joined'), playerId, token: reconnectToken, code: roomCode }),
  /** `game` is the game's view(state, you) output; null in the lobby. `now` is server time (ms), for countdowns. */
  z.object({ type: z.literal('state'), room: roomViewSchema, game: z.unknown(), now: z.number() }),
  z.object({ type: z.literal('error'), code: errorCodeSchema, message: z.string() }),
  z.object({ type: z.literal('notice'), kind: noticeKindSchema.optional(), message: z.string() }),
])

export type ServerMessage = z.infer<typeof serverMessageSchema>

/** Parses one server frame (client side, and in tests). Never throws. */
export function parseServerMessage(raw: string): ParseResult<ServerMessage> {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Message is not valid JSON' }
  }
  const result = serverMessageSchema.safeParse(data)
  if (!result.success) return { ok: false, error: z.prettifyError(result.error) }
  return { ok: true, message: result.data }
}
