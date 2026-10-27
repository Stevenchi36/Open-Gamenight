/**
 * Boots the real app on a random port with temp SQLite files.
 * Used by auth route tests now and by the runner/integration tests later.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { AnyGameModule } from '@ogn/core/contract'
import type { MessagesClient } from '../../src/ai.ts'
import type { Booted } from '../../src/boot.ts'
import { parseConfig, type Env } from '../../src/config.ts'
import type { RoomManager } from '../../src/rooms.ts'
import { startServer, type RunningServer } from '../../src/server.ts'
import type { attachWebSocket, WsOptions } from '../../src/ws.ts'

export const ORIGIN = 'http://localhost:5173'

export interface TestServer {
  url: string
  booted: Booted
  server: Server
  rooms: RoomManager
  ws: ReturnType<typeof attachWebSocket>
  /** ws://.../ws */
  wsUrl: string
  /** The real SIGTERM path (restart notice, close sockets, stop HTTP, close DBs). */
  shutdown: RunningServer['shutdown']
  /** Create an account directly (server-side admin API). */
  createUser(email: string, role: 'user' | 'admin', name?: string): Promise<{ id: string; email: string }>
  /** Sign in over HTTP; returns the Cookie header value. */
  signIn(email: string): Promise<string>
  fetch(path: string, init?: RequestInit & { cookie?: string }): Promise<Response>
  close(): Promise<void>
}

export const PASSWORD = 'test-password-123'

/** Drop the words and categories that migration imposter:003_default_words seeds. */
export function emptyWordLibrary(db: DatabaseSync): void {
  db.exec("DELETE FROM imposter_words; DELETE FROM categories WHERE game_id = 'imposter'")
}

export async function startTestServer(
  options: {
    env?: Partial<Record<keyof Env, string>>
    games?: readonly AnyGameModule[]
    authRateLimit?: boolean
    ws?: Partial<Pick<WsOptions, 'heartbeatMs' | 'maxConnectionsPerIp' | 'messagesPerSecond'>>
    /** Fake Anthropic client: turns AI features on without a key. */
    aiClient?: MessagesClient
    /** Keep the default word library from the migrations; otherwise tests start with an empty one. */
    seededLibrary?: boolean
    /** Repo root to resolve against; the built client is served from <rootDir>/apps/client/dist. */
    rootDir?: string
  } = {},
): Promise<TestServer> {
  const dir = mkdtempSync(join(tmpdir(), 'ogn-test-'))
  const config = parseConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-!!',
    BETTER_AUTH_URL: ORIGIN,
    ALLOWED_ORIGINS: ORIGIN,
    AUTH_DB_PATH: join(dir, 'auth.db'),
    GAMES_DB_PATH: join(dir, 'games.db'),
    ...options.env,
  }, options.rootDir)
  const running = await startServer(config, {
    auth: { rateLimit: options.authRateLimit ?? false },
    ...(options.games ? { games: options.games } : {}),
    ...(options.ws ? { ws: options.ws } : {}),
    ...(options.aiClient ? { aiClient: options.aiClient } : {}),
    port: 0,
    host: '127.0.0.1',
  })
  const { booted, server, rooms, ws, url } = running
  if (!options.seededLibrary && booted.games.some((g) => g.id === 'imposter')) emptyWordLibrary(booted.gamesDb)

  const doFetch: TestServer['fetch'] = (path, init = {}) => {
    const { cookie, headers, ...rest } = init
    return fetch(url + path, {
      ...rest,
      headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}), ...(headers as Record<string, string>) },
    })
  }

  return {
    url,
    wsUrl: url.replace('http', 'ws') + '/ws',
    booted,
    server,
    rooms,
    ws,
    shutdown: running.shutdown,
    fetch: doFetch,
    async createUser(email, role, name = email.split('@')[0]!) {
      const { user } = await booted.auth.api.createUser({ body: { email, password: PASSWORD, name, role } })
      return user
    },
    async signIn(email) {
      const res = await doFetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD }),
      })
      if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`)
      return res.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ')
    },
    async close() {
      ws.close()
      await running.shutdown()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
