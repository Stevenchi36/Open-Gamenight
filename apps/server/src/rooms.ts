/**
 * Room registry and membership: create/join/reconnect/leave, lobby actions,
 * host transfer and automatic migration, caps, idle cleanup.
 * Transport-agnostic: talks to clients through the Conn interface. Every
 * change to a room runs on that room's queue, one at a time, then broadcasts.
 */
import { randomBytes, randomInt } from 'node:crypto'
import { MAX_PLAYERS_CAP, type AnyGameModule, type PlayerInfo, type ServerServices } from '@wsfg/core/contract'
import {
  displayName,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ClientMessage,
  type NoticeKind,
  type RoomView,
  type ServerMessage,
} from '@wsfg/core/protocol'
import { z } from 'zod'
import type { SessionUser } from './auth.ts'
import { realClock, type Clock, type TimerHandle } from './clock.ts'
import { RoomError } from './errors.ts'
import type { Config } from './config.ts'
import type { AppLogger } from './logger.ts'
import { RateLimiter } from './middleware.ts'
import { GameRunner, type RunningGame } from './runner.ts'

export const HOST_GRACE_MS = 2 * 60_000
export const ROOM_IDLE_MS = 60 * 60_000
/** Rooms with nobody connected are closed after this long. */
export const ROOM_EMPTY_MS = 10 * 60_000

// ---------------------------------------------------------------- types

/** One client connection (a websocket in production, a fake in tests). */
export interface Conn {
  readonly id: string
  readonly ip: string
  readonly user: SessionUser | null
  room: Room | null
  playerId: string | null
  send(message: ServerMessage): void
}

export interface Player {
  id: string
  name: string
  /** Better Auth user id, or null for guests. */
  userId: string | null
  token: string
  conn: Conn | null
  disconnectedAt: number | null
}

export interface Room {
  code: string
  /** Who created it; the room counts against their MAX_ROOMS_PER_USER until it closes. */
  creatorUserId: string
  hostId: string
  /** Join order. */
  players: Player[]
  gameId: string
  settings: unknown
  phase: 'lobby' | 'playing'
  game: RunningGame | null
  hostTimer: TimerHandle | null
  lastActivity: number
  /** Last time anyone was connected. */
  lastConnected: number
  queue: Promise<void>
  closed: boolean
}

export interface RoomManagerDeps {
  games: readonly AnyGameModule[]
  config: Pick<Config, 'MAX_ROOMS' | 'MAX_ROOMS_PER_USER'>
  servicesFor: (game: AnyGameModule) => ServerServices
  logger: AppLogger
  clock?: Clock
  /** Join/reconnect attempts per IP (room-code guessing). */
  joinLimiter?: RateLimiter
}

// ---------------------------------------------------------------- manager

export class RoomManager {
  readonly rooms = new Map<string, Room>()
  readonly clock: Clock
  readonly logger: AppLogger
  private readonly games: readonly AnyGameModule[]
  private readonly config: RoomManagerDeps['config']
  private readonly joinLimiter: RateLimiter
  private readonly runner: GameRunner

  constructor(deps: RoomManagerDeps) {
    this.games = deps.games
    this.config = deps.config
    this.logger = deps.logger
    this.clock = deps.clock ?? realClock
    this.joinLimiter = deps.joinLimiter ?? new RateLimiter({ windowMs: 60_000, max: 20 })
    this.runner = new GameRunner({
      clock: this.clock,
      logger: deps.logger,
      servicesFor: deps.servicesFor,
      enqueue: (room, fn) => this.enqueue(room, fn),
      notify: (room, playerIds, message) => {
        for (const id of playerIds) this.notice(room.players.find((p) => p.id === id)?.conn, 'info', message)
      },
      playerInfos: (room) => this.playerInfos(room),
      endGame: (room) => this.endGame(room),
    })
  }

  // ---- entry points

  /** Handle one validated client message. Errors go back to the sender. */
  async handle(conn: Conn, msg: ClientMessage): Promise<void> {
    try {
      switch (msg.type) {
        case 'create_room':
          return await this.createRoom(conn, msg.gameId, msg.name)
        case 'join_room':
          return await this.joinRoom(conn, msg.code, msg.name)
        case 'reconnect':
          return await this.reconnect(conn, msg.code, msg.token)
        default: {
          const room = conn.room
          if (!room || room.closed) throw new RoomError('not_found', 'You are not in a room')
          await this.enqueue(room, () => this.handleInRoom(room, conn, msg))
        }
      }
    } catch (error) {
      this.sendError(conn, error)
    }
  }

  /** The socket closed. The player stays in the room, marked disconnected. */
  async disconnected(conn: Conn): Promise<void> {
    const room = conn.room
    if (!room || room.closed) return
    await this.enqueue(room, () => {
      const player = room.players.find((p) => p.conn === conn)
      if (!player) return
      player.conn = null
      player.disconnectedAt = this.clock.now()
      if (player.id === room.hostId) this.startHostTimer(room)
      if (room.game) this.runner.hook(room, 'onPlayerDisconnected', player.id)
    })
  }

  /** Close idle and abandoned rooms. Call periodically. */
  sweep(): void {
    const now = this.clock.now()
    for (const room of this.rooms.values()) {
      const anyoneConnected = room.players.some((p) => p.conn)
      if (anyoneConnected) room.lastConnected = now
      if (now - room.lastActivity > ROOM_IDLE_MS) this.closeRoom(room, 'The room closed after an hour of inactivity.')
      else if (!anyoneConnected && now - room.lastConnected > ROOM_EMPTY_MS) this.closeRoom(room, 'The room closed.')
    }
  }

  /** SIGTERM: tell everyone, then the transport closes the sockets. */
  shutdown(): void {
    for (const room of this.rooms.values()) {
      for (const p of room.players) {
        this.notice(p.conn, 'server_restarting', 'The server is restarting, rejoin in a moment.')
      }
    }
  }

  // ---- create / join / reconnect / leave

  private async createRoom(conn: Conn, gameId: string | undefined, name: string | undefined): Promise<void> {
    if (!conn.user) throw new RoomError('unauthorized', 'Sign in to create a room')
    const game = gameId ? this.games.find((g) => g.id === gameId) : this.games[0]
    if (!game) throw new RoomError('not_found', 'Unknown game')
    if (this.rooms.size >= this.config.MAX_ROOMS) throw new RoomError('room_cap', 'The server is full, try again later')
    const mine = [...this.rooms.values()].filter((r) => r.creatorUserId === conn.user!.id).length
    if (mine >= this.config.MAX_ROOMS_PER_USER) {
      throw new RoomError('room_cap', `You already have ${mine} open room${mine === 1 ? '' : 's'}. Close one first.`)
    }
    const playerName = name ?? defaultName(conn.user.name)
    if (conn.room) await this.leave(conn)

    const now = this.clock.now()
    const room: Room = {
      code: this.newCode(),
      creatorUserId: conn.user.id,
      hostId: '',
      players: [],
      gameId: game.id,
      settings: structuredClone(game.defaultSettings),
      phase: 'lobby',
      game: null,
      hostTimer: null,
      lastActivity: now,
      lastConnected: now,
      queue: Promise.resolve(),
      closed: false,
    }
    this.rooms.set(room.code, room)
    await this.enqueue(room, () => {
      const player = this.addPlayer(room, conn, playerName)
      room.hostId = player.id
    })
    this.logger.info('room created', { code: room.code, game: game.id, user: conn.user.id })
  }

  private async joinRoom(conn: Conn, rawCode: string, name: string): Promise<void> {
    if (!this.joinLimiter.consume(conn.ip)) throw new RoomError('rate_limited', 'Too many attempts, wait a minute')
    const room = this.rooms.get(rawCode)
    if (!room || room.closed) throw new RoomError('not_found', 'No room with that code')
    if (conn.room === room) return this.enqueue(room, () => this.sendJoined(conn, this.playerOf(room, conn)!))
    if (conn.room) await this.leave(conn)

    await this.enqueue(room, () => {
      // A signed-in user rejoining (e.g. from another device) takes their seat back.
      const existing = conn.user && room.players.find((p) => p.userId === conn.user!.id)
      if (existing) {
        existing.token = newToken()
        this.attach(room, existing, conn)
        return
      }
      this.addPlayer(room, conn, name)
    })
  }

  private async reconnect(conn: Conn, code: string, token: string): Promise<void> {
    if (!this.joinLimiter.consume(conn.ip)) throw new RoomError('rate_limited', 'Too many attempts, wait a minute')
    const room = this.rooms.get(code)
    if (!room || room.closed) throw new RoomError('not_found', 'That room has closed')
    if (conn.room && conn.room !== room) await this.leave(conn)
    await this.enqueue(room, () => {
      const player = room.players.find((p) => p.token === token)
      if (!player) throw new RoomError('not_found', 'You are no longer in that room')
      this.attach(room, player, conn)
    })
  }

  private leave(conn: Conn): Promise<void> {
    const room = conn.room
    if (!room) return Promise.resolve()
    return this.enqueue(room, () => {
      const player = this.playerOf(room, conn)
      if (player) this.removePlayer(room, player.id)
    })
  }

  // ---- in-room messages

  private async handleInRoom(room: Room, conn: Conn, msg: ClientMessage): Promise<void> {
    const player = this.playerOf(room, conn)
    if (!player) throw new RoomError('not_found', 'You are not in this room')
    const isHost = player.id === room.hostId
    const hostOnly = () => {
      if (!isHost) throw new RoomError('forbidden', 'Only the host can do that')
    }
    const lobbyOnly = () => {
      if (room.phase !== 'lobby') throw new RoomError('validation', 'Only in the lobby')
    }

    switch (msg.type) {
      case 'leave':
        this.removePlayer(room, player.id)
        return

      case 'set_name':
        lobbyOnly()
        this.assertNameFree(room, msg.name, player.id)
        player.name = msg.name
        return

      case 'select_game': {
        hostOnly()
        lobbyOnly()
        const game = this.games.find((g) => g.id === msg.gameId)
        if (!game) throw new RoomError('not_found', 'Unknown game')
        room.gameId = game.id
        room.settings = structuredClone(game.defaultSettings)
        return
      }

      case 'update_settings': {
        hostOnly()
        lobbyOnly()
        const parsed = this.gameOf(room).settingsSchema.safeParse(msg.settings)
        if (!parsed.success) throw new RoomError('validation', z.prettifyError(parsed.error))
        room.settings = parsed.data
        return
      }

      case 'start_game': {
        hostOnly()
        lobbyOnly()
        const game = this.gameOf(room)
        const count = room.players.length
        if (count < game.minPlayers) throw new RoomError('validation', `Need at least ${game.minPlayers} players`)
        if (count > this.maxPlayers(game)) throw new RoomError('validation', `At most ${this.maxPlayers(game)} players`)
        await this.runner.start(room, game)
        return
      }

      case 'return_to_lobby':
        hostOnly()
        if (room.phase !== 'playing') throw new RoomError('validation', 'No game is running')
        this.endGame(room)
        return

      case 'transfer_host': {
        hostOnly()
        const target = room.players.find((p) => p.id === msg.playerId)
        if (!target) throw new RoomError('not_found', 'No such player')
        this.setHost(room, target)
        return
      }

      case 'kick': {
        hostOnly()
        if (msg.playerId === player.id) throw new RoomError('validation', "You can't kick yourself")
        const target = room.players.find((p) => p.id === msg.playerId)
        if (!target) throw new RoomError('not_found', 'No such player')
        this.notice(target.conn, 'removed', 'The host removed you from the room.')
        this.removePlayer(room, target.id)
        return
      }

      case 'action':
        if (!room.game) throw new RoomError('validation', 'No game is running')
        await this.runner.action(room, player.id, msg.action)
        return

      case 'create_room':
      case 'join_room':
      case 'reconnect':
        return // handled before the room queue
    }
  }

  // ---- membership helpers

  private addPlayer(room: Room, conn: Conn, rawName: string): Player {
    const game = this.gameOf(room)
    if (room.players.length >= this.maxPlayers(game)) throw new RoomError('room_cap', 'That room is full')
    const name = rawName.trim()
    this.assertNameFree(room, name, null)
    const player: Player = {
      id: `p_${randomBytes(6).toString('base64url')}`,
      name,
      userId: conn.user?.id ?? null,
      token: newToken(),
      conn: null,
      disconnectedAt: null,
    }
    room.players.push(player)
    this.attach(room, player, conn)
    return player
  }

  /** Bind a connection to a player (join, reconnect, or takeover from another device). */
  private attach(room: Room, player: Player, conn: Conn): void {
    const previous = player.conn
    if (previous && previous !== conn) {
      this.notice(previous, 'removed', 'You joined from another tab or device.')
      previous.room = null
      previous.playerId = null
    }
    const wasDisconnected = player.conn === null && player.disconnectedAt !== null
    player.conn = conn
    player.disconnectedAt = null
    conn.room = room
    conn.playerId = player.id
    room.lastConnected = this.clock.now()
    this.sendJoined(conn, player)

    if (player.id === room.hostId) this.cancelHostTimer(room)
    else this.maybeMigrateHost(room)
    if (wasDisconnected && room.game) this.runner.hook(room, 'onPlayerReconnected', player.id)
  }

  private removePlayer(room: Room, playerId: string): void {
    const index = room.players.findIndex((p) => p.id === playerId)
    if (index === -1) return
    const [player] = room.players.splice(index, 1)
    if (player!.conn) {
      player!.conn.room = null
      player!.conn.playerId = null
    }
    if (room.players.length === 0) {
      this.closeRoom(room, null)
      return
    }
    if (room.hostId === playerId) {
      this.setHost(room, room.players.find((p) => p.conn) ?? room.players[0]!)
    }
    if (room.game) this.runner.hook(room, 'onPlayerRemoved', playerId)
  }

  private assertNameFree(room: Room, name: string, exceptId: string | null): void {
    const taken = room.players.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase())
    if (taken) throw new RoomError('validation', `Someone in this room is already called ${name}`)
  }

  // ---- host

  private setHost(room: Room, player: Player): void {
    room.hostId = player.id
    this.cancelHostTimer(room)
    if (!player.conn) this.startHostTimer(room)
  }

  private startHostTimer(room: Room): void {
    this.cancelHostTimer(room)
    room.hostTimer = this.clock.setTimeout(() => {
      room.hostTimer = null
      void this.enqueue(room, () => this.maybeMigrateHost(room)).catch(() => {})
    }, HOST_GRACE_MS)
  }

  private cancelHostTimer(room: Room): void {
    room.hostTimer?.cancel()
    room.hostTimer = null
  }

  /** After ~2 min without the host, hand it to the first connected player in join order. */
  private maybeMigrateHost(room: Room): void {
    const host = room.players.find((p) => p.id === room.hostId)
    if (!host || host.conn || host.disconnectedAt === null) return
    if (this.clock.now() - host.disconnectedAt < HOST_GRACE_MS) return
    const next = room.players.find((p) => p.conn && p.id !== host.id)
    if (!next) return // nobody to hand it to yet; retried when someone connects
    room.hostId = next.id
    for (const p of room.players) this.notice(p.conn, 'info', `${host.name} is away, so ${next.name} is now the host.`)
  }

  // ---- game lifecycle

  private endGame(room: Room): void {
    this.runner.stop(room)
    room.phase = 'lobby'
  }

  private closeRoom(room: Room, message: string | null): void {
    if (room.closed) return
    room.closed = true
    this.runner.stop(room)
    this.cancelHostTimer(room)
    for (const p of room.players) {
      if (!p.conn) continue
      if (message) this.notice(p.conn, 'removed', message)
      p.conn.room = null
      p.conn.playerId = null
    }
    this.rooms.delete(room.code)
    this.logger.info('room closed', { code: room.code })
  }

  // ---- queue + broadcast

  /** Run fn on the room's queue, then broadcast. Rejects with fn's error. */
  enqueue(room: Room, fn: () => void | Promise<void>): Promise<void> {
    const run = room.queue.then(async () => {
      if (room.closed) return
      await fn()
      room.lastActivity = this.clock.now()
      this.broadcast(room)
    })
    room.queue = run.catch(() => {})
    return run
  }

  broadcast(room: Room): void {
    if (room.closed) return
    for (const player of room.players) {
      if (!player.conn) continue
      player.conn.send({
        type: 'state',
        room: this.roomView(room, player.id),
        game: this.runner.view(room, player.id),
        now: this.clock.now(),
      })
    }
  }

  roomView(room: Room, playerId: string): RoomView {
    const game = this.gameOf(room)
    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      game: { id: game.id, name: game.name, settings: room.settings },
      availableGames: [...this.games].sort((a, b) => a.name.localeCompare(b.name)).map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        minPlayers: g.minPlayers,
        maxPlayers: this.maxPlayers(g),
      })),
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.conn !== null,
        isHost: p.id === room.hostId,
        isLoggedIn: p.userId !== null,
      })),
      you: { id: playerId },
    }
  }

  // ---- small helpers

  playerInfos(room: Room): PlayerInfo[] {
    return room.players.map((p) => ({ id: p.id, name: p.name, connected: p.conn !== null, isLoggedIn: p.userId !== null }))
  }

  private playerOf(room: Room, conn: Conn): Player | undefined {
    return room.players.find((p) => p.conn === conn)
  }

  private gameOf(room: Room): AnyGameModule {
    const game = this.games.find((g) => g.id === room.gameId)
    if (!game) throw new Error(`room ${room.code} has unknown game ${room.gameId}`)
    return game
  }

  private maxPlayers(game: AnyGameModule): number {
    return Math.min(game.maxPlayers, MAX_PLAYERS_CAP)
  }

  private newCode(): string {
    for (;;) {
      let code = ''
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
      if (!this.rooms.has(code)) return code
    }
  }

  private sendJoined(conn: Conn, player: Player): void {
    conn.send({ type: 'joined', playerId: player.id, token: player.token, code: conn.room!.code })
  }

  private notice(conn: Conn | null | undefined, kind: NoticeKind, message: string): void {
    conn?.send({ type: 'notice', kind, message })
  }

  private sendError(conn: Conn, error: unknown): void {
    if (error instanceof RoomError) {
      conn.send({ type: 'error', code: error.code, message: error.message })
      return
    }
    this.logger.error('unhandled room error', { error: error instanceof Error ? error.stack : String(error) })
    conn.send({ type: 'error', code: 'game', message: 'Something went wrong' })
  }
}

function newToken(): string {
  return randomBytes(24).toString('base64url')
}

function defaultName(accountName: string): string {
  const parsed = displayName.safeParse(accountName.slice(0, 16))
  return parsed.success ? parsed.data : 'Host'
}
