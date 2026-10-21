/**
 * Boots the real app on a random port with temp SQLite files.
 * Used by auth route tests now and by the runner/integration tests later.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AnyGameModule } from '@wsfg/core/contract'
import { createApp } from '../../src/app.ts'
import { boot, type Booted } from '../../src/boot.ts'
import { parseConfig, type Env } from '../../src/config.ts'

export const ORIGIN = 'http://localhost:5173'

export interface TestServer {
  url: string
  booted: Booted
  server: Server
  /** Create an account directly (server-side admin API). */
  createUser(email: string, role: 'user' | 'admin', name?: string): Promise<{ id: string; email: string }>
  /** Sign in over HTTP; returns the Cookie header value. */
  signIn(email: string): Promise<string>
  fetch(path: string, init?: RequestInit & { cookie?: string }): Promise<Response>
  close(): Promise<void>
}

export const PASSWORD = 'test-password-123'

export async function startTestServer(
  options: { env?: Partial<Record<keyof Env, string>>; games?: readonly AnyGameModule[]; authRateLimit?: boolean } = {},
): Promise<TestServer> {
  const dir = mkdtempSync(join(tmpdir(), 'wsfg-test-'))
  const config = parseConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-!!',
    BETTER_AUTH_URL: ORIGIN,
    ALLOWED_ORIGINS: ORIGIN,
    AUTH_DB_PATH: join(dir, 'auth.db'),
    GAMES_DB_PATH: join(dir, 'games.db'),
    ...options.env,
  })
  const booted = await boot(config, {
    auth: { rateLimit: options.authRateLimit ?? false },
    ...(options.games ? { games: options.games } : {}),
  })
  const server = createServer(createApp(booted))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const doFetch: TestServer['fetch'] = (path, init = {}) => {
    const { cookie, headers, ...rest } = init
    return fetch(url + path, {
      ...rest,
      headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}), ...(headers as Record<string, string>) },
    })
  }

  return {
    url,
    booted,
    server,
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
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      booted.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
