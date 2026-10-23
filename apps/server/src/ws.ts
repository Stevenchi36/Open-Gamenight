/**
 * WebSocket transport (ws, noServer). The upgrade is checked before the
 * handshake completes: path must be /ws, Origin must be allowed, per-IP
 * connection cap, and the session is resolved from the cookie. Then:
 * 30s heartbeat (unanswered ping = terminate = disconnected), small
 * maxPayload, per-socket message rate limit, zod-validated messages.
 */
import { randomBytes } from 'node:crypto'
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { MAX_PAYLOAD_BYTES, parseClientMessage, type ServerMessage } from '@wsfg/core/protocol'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import type { Auth, SessionUser } from './auth.ts'
import type { Config } from './config.ts'
import type { AppLogger } from './logger.ts'
import { clientIp, getSessionUser, isAllowedOrigin, RateLimiter } from './middleware.ts'
import type { Conn, RoomManager } from './rooms.ts'

export interface WsOptions {
  config: Config
  auth: Auth
  rooms: RoomManager
  logger: AppLogger
  /** Sent in `session` so tabs running an older client build reload. */
  buildId: string | null
  heartbeatMs?: number
  maxConnectionsPerIp?: number
  messagesPerSecond?: number
}

/** Close codes the client understands. */
export const CLOSE = {
  restarting: 1012,
  rateLimited: 1008,
} as const

class SocketConn implements Conn {
  readonly id = randomBytes(6).toString('base64url')
  readonly ip: string
  readonly user: SessionUser | null
  readonly socket: WebSocket
  room: Conn['room'] = null
  playerId: string | null = null
  alive = true
  violations = 0

  constructor(socket: WebSocket, ip: string, user: SessionUser | null) {
    this.socket = socket
    this.ip = ip
    this.user = user
  }

  send(message: ServerMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
  }
}

export function attachWebSocket(server: Server, options: WsOptions) {
  const { config, auth, rooms, logger, buildId } = options
  const heartbeatMs = options.heartbeatMs ?? 30_000
  const maxPerIp = options.maxConnectionsPerIp ?? 30
  const perSecond = options.messagesPerSecond ?? 10

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES })
  const conns = new Set<SocketConn>()
  const perIp = new Map<string, number>()
  const release = (ip: string) => {
    const n = (perIp.get(ip) ?? 1) - 1
    if (n <= 0) perIp.delete(ip)
    else perIp.set(ip, n)
  }

  const onUpgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => socket.destroy())
    const reject = (status: number, text: string) => {
      socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
      socket.destroy()
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path !== '/ws') return reject(404, 'Not Found')
    if (!isAllowedOrigin(req.headers.origin, config)) return reject(403, 'Forbidden')

    const ip = clientIp(req.headers, req.socket.remoteAddress, config)
    if ((perIp.get(ip) ?? 0) >= maxPerIp) return reject(429, 'Too Many Requests')
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1) // reserve before the async session lookup

    let user: SessionUser | null
    try {
      user = await getSessionUser(auth, req.headers)
    } catch (error) {
      release(ip)
      logger.error('session lookup failed on upgrade', { error: String(error) })
      return reject(500, 'Internal Server Error')
    }
    if (socket.destroyed) return release(ip)
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip, user))
  }

  const onConnection = (ws: WebSocket, ip: string, user: SessionUser | null) => {
    const conn = new SocketConn(ws, ip, user)
    const limiter = new RateLimiter({ windowMs: 1000, max: perSecond })
    conns.add(conn)
    conn.send({
      type: 'session',
      user: user ? { id: user.id, name: user.name, role: user.role } : null,
      build: buildId,
    })

    ws.on('pong', () => {
      conn.alive = true
    })
    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (!limiter.consume(conn.id)) {
        if (++conn.violations > 50) return ws.close(CLOSE.rateLimited, 'Too many messages')
        if (conn.violations % 10 === 1) conn.send({ type: 'error', code: 'rate_limited', message: 'Slow down' })
        return
      }
      if (isBinary) return conn.send({ type: 'error', code: 'validation', message: 'Text messages only' })
      const parsed = parseClientMessage(rawText(data))
      if (!parsed.ok) return conn.send({ type: 'error', code: 'validation', message: parsed.error })
      void rooms.handle(conn, parsed.message)
    })
    ws.on('close', () => {
      conns.delete(conn)
      release(ip)
      void rooms.disconnected(conn)
    })
    ws.on('error', (error) => logger.debug('socket error', { error: error.message }))
  }

  server.on('upgrade', (req, socket, head) => void onUpgrade(req, socket, head))

  const heartbeat = setInterval(() => {
    for (const conn of conns) {
      if (!conn.alive) {
        conn.socket.terminate()
        continue
      }
      conn.alive = false
      conn.socket.ping()
    }
  }, heartbeatMs)
  heartbeat.unref()

  const sweep = setInterval(() => rooms.sweep(), 60_000)
  sweep.unref()

  return {
    wss,
    connections: conns,
    /** SIGTERM: send the restart notice, close every socket cleanly, resolve when done (max 2s). */
    async shutdown(): Promise<void> {
      clearInterval(heartbeat)
      clearInterval(sweep)
      rooms.shutdown()
      const closed = [...conns].map(
        (c) => new Promise<void>((resolve) => {
          c.socket.once('close', () => resolve())
          c.socket.close(CLOSE.restarting, 'Server restarting')
        }),
      )
      await Promise.race([Promise.all(closed), new Promise((r) => setTimeout(r, 2000))])
      for (const c of conns) c.socket.terminate()
      wss.close()
    },
    /** Hard stop without notices (tests). */
    close(): void {
      clearInterval(heartbeat)
      clearInterval(sweep)
      for (const c of conns) c.socket.terminate()
      wss.close()
    },
  }
}

function rawText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  return data.toString('utf8')
}
