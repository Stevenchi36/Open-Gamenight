/** Fakes for RoomManager tests: a manual clock and in-memory connections. */
import type { AnyGameModule } from '@wsfg/core/contract'
import type { ClientMessage, ServerMessage } from '@wsfg/core/protocol'
import { clientMessageSchema } from '@wsfg/core/protocol'
import { games as registry } from '@wsfg/games/server'
import type { SessionUser } from '../../src/auth.ts'
import type { Clock, TimerHandle } from '../../src/clock.ts'
import { migrateGamesDb, openDatabase } from '../../src/db.ts'
import { createLogger } from '../../src/logger.ts'
import { RateLimiter } from '../../src/middleware.ts'
import { RoomManager, type Conn, type Room } from '../../src/rooms.ts'

export class ManualClock implements Clock {
  private t = 1_000_000
  private timers: { at: number; fn: () => void; cancelled: boolean; seq: number }[] = []
  private seq = 0

  now(): number {
    return this.t
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    const timer = { at: this.t + Math.max(0, ms), fn, cancelled: false, seq: this.seq++ }
    this.timers.push(timer)
    return { cancel: () => (timer.cancelled = true) }
  }

  /** Move time forward, firing due timers in order. Await `settle()` afterwards. */
  advance(ms: number): void {
    const target = this.t + ms
    for (;;) {
      const due = this.timers
        .filter((t) => !t.cancelled && t.at <= target)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0]
      if (!due) break
      due.cancelled = true
      this.t = due.at
      due.fn()
    }
    this.t = target
  }
}

let nextConn = 0

export class FakeConn implements Conn {
  readonly id = `c${nextConn++}`
  readonly ip: string
  readonly user: SessionUser | null
  room: Room | null = null
  playerId: string | null = null
  readonly inbox: ServerMessage[] = []

  constructor(user: SessionUser | null = null, ip = '10.0.0.1') {
    this.user = user
    this.ip = ip
  }

  send(message: ServerMessage): void {
    this.inbox.push(structuredClone(message))
  }

  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.inbox.filter((m) => m.type === type).at(-1) as Extract<ServerMessage, { type: T }> | undefined
  }

  all<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.inbox.filter((m) => m.type === type) as Extract<ServerMessage, { type: T }>[]
  }

  clear(): void {
    this.inbox.length = 0
  }
}

export const user = (id: string, role: 'user' | 'admin' = 'user'): SessionUser => ({
  id,
  name: `User ${id}`,
  email: `${id}@example.com`,
  role,
})

export function createManager(
  options: { games?: readonly AnyGameModule[]; maxRooms?: number; maxRoomsPerUser?: number; joinLimit?: number } = {},
) {
  const clock = new ManualClock()
  const games = options.games ?? registry
  const db = openDatabase(':memory:')
  migrateGamesDb(db, games)
  const rooms = new RoomManager({
    games,
    config: { MAX_ROOMS: options.maxRooms ?? 50, MAX_ROOMS_PER_USER: options.maxRoomsPerUser ?? 2 },
    logger: createLogger('test', 'silent'),
    servicesFor: (game) => ({ gameId: game.id, db, ai: null, logger: createLogger(game.id, 'silent') }),
    clock,
    joinLimiter: new RateLimiter({ windowMs: 60_000, max: options.joinLimit ?? 1000 }),
  })
  /** Send a message as it would arrive after zod validation. */
  const send = (conn: Conn, message: unknown) => rooms.handle(conn, clientMessageSchema.parse(message) as ClientMessage)
  /** Let queued room work (timers firing, etc.) finish. */
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.all([...rooms.rooms.values()].map((r) => r.queue))
      await new Promise((r) => setImmediate(r))
    }
  }
  return { rooms, clock, send, settle }
}
