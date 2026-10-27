/** A real `ws` client that records every server message, for transport and integration tests. */
import { parseServerMessage, type ServerMessage } from '@ogn/core/protocol'
import { WebSocket, type ClientOptions } from 'ws'
import { ORIGIN } from './server.ts'

export interface TestClient {
  ws: WebSocket
  messages: ServerMessage[]
  send(message: unknown): void
  /** Resolves with the oldest not-yet-consumed message of this type (already received or still to come). */
  next<T extends ServerMessage['type']>(type: T, match?: (m: Extract<ServerMessage, { type: T }>) => boolean): Promise<Extract<ServerMessage, { type: T }>>
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined
  closed: Promise<{ code: number; reason: string }>
  close(): void
}

export function connect(url: string, options: { cookie?: string; origin?: string } & ClientOptions = {}): Promise<TestClient> {
  const { cookie, origin = ORIGIN, ...rest } = options
  const ws = new WebSocket(url, { ...rest, headers: { origin, ...(cookie ? { cookie } : {}) } })
  const messages: ServerMessage[] = []
  const waiters: { type: string; match: (m: never) => boolean; resolve: (m: ServerMessage) => void }[] = []
  const consumed = new Set<ServerMessage>()

  ws.on('message', (data) => {
    const parsed = parseServerMessage(data.toString())
    if (!parsed.ok) throw new Error(`bad server message: ${parsed.error}`)
    messages.push(parsed.message)
    const w = waiters.find((w) => w.type === parsed.message.type && w.match(parsed.message as never))
    if (w) {
      waiters.splice(waiters.indexOf(w), 1)
      consumed.add(parsed.message)
      w.resolve(parsed.message)
    }
  })
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() })),
  )

  const client: TestClient = {
    ws,
    messages,
    closed,
    send: (message) => ws.send(JSON.stringify(message)),
    next(type, match = () => true) {
      const ready = messages.find((m) => !consumed.has(m) && m.type === type && match(m as never))
      if (ready) {
        consumed.add(ready)
        return Promise.resolve(ready as never)
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), 3000)
        waiters.push({
          type,
          match: match as (m: never) => boolean,
          resolve: (m) => {
            clearTimeout(timer)
            resolve(m as never)
          },
        })
      })
    },
    last(type) {
      return messages.filter((m) => m.type === type).at(-1) as never
    },
    close: () => ws.close(),
  }

  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(client))
    ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)))
    ws.once('error', reject)
  })
}
