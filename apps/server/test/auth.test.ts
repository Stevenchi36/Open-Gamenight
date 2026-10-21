import { defineGame } from '@wsfg/core/contract'
import { games } from '@wsfg/games/server'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { startTestServer, type TestServer } from './helpers/server.ts'

const imposter = games[0]!

/** A fake game whose admin router tries to reach outside its prefix. */
const probe = defineGame({
  ...imposter,
  id: 'probe',
  name: 'Probe',
  migrations: [],
  settingsSchema: z.object({}),
  defaultSettings: {},
  adminRouter: () => {
    const router = express.Router()
    router.get('/ping', (_req, res) => res.json({ pong: true }))
    router.post('/echo', (req, res) => res.json({ body: req.body }))
    // Paths are relative to /api/admin/probe; there is no way to register /api/admin/status here.
    router.get('/../status', (_req, res) => res.json({ escaped: true }))
    return router
  },
} as never)

let t: TestServer
let userCookie: string
let adminCookie: string

beforeAll(async () => {
  t = await startTestServer({ games: [imposter, probe] })
  await t.createUser('user@example.com', 'user')
  await t.createUser('admin@example.com', 'admin')
  userCookie = await t.signIn('user@example.com')
  adminCookie = await t.signIn('admin@example.com')
})
afterAll(() => t.close())

describe('accounts', () => {
  it('rejects public sign-up', async () => {
    const res = await t.fetch('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com', password: 'whatever-123', name: 'New' }),
    })
    expect(res.ok).toBe(false)
    expect(await res.json()).toMatchObject({ code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' })
  })

  it('puts the role on the server-side session user', async () => {
    const res = await t.fetch('/api/auth/get-session', { cookie: adminCookie })
    expect(((await res.json()) as { user: unknown }).user).toMatchObject({ email: 'admin@example.com', role: 'admin' })
  })

  it("lets only admins use Better Auth's admin endpoints", async () => {
    const asUser = await t.fetch('/api/auth/admin/list-users', { cookie: userCookie })
    expect(asUser.status).toBe(403)
    const asAdmin = await t.fetch('/api/auth/admin/list-users', { cookie: adminCookie })
    expect(asAdmin.status).toBe(200)
    expect(((await asAdmin.json()) as { users: unknown[] }).users).toHaveLength(2)
  })

  it('blocks a banned user', async () => {
    const victim = await t.createUser('banned@example.com', 'user')
    const cookie = await t.signIn('banned@example.com')
    const ban = await t.fetch('/api/auth/admin/ban-user', {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: victim.id }),
    })
    expect(ban.status).toBe(200)
    expect((await t.fetch('/api/admin/status', { cookie })).status).toBe(401)
    await expect(t.signIn('banned@example.com')).rejects.toThrow(/sign-in failed/)
  })
})

describe('core and game admin routes', () => {
  it.each(['/api/admin/status', '/api/admin/probe/ping'])('%s: guest 401, user 403, admin 200', async (path) => {
    expect((await t.fetch(path)).status).toBe(401)
    expect((await t.fetch(path, { cookie: userCookie })).status).toBe(403)
    const res = await t.fetch(path, { cookie: adminCookie })
    expect(res.status).toBe(200)
  })

  it('game routers cannot escape their prefix', async () => {
    // Both normalize to /api/admin/status, which is the core route, not the game's.
    for (const path of ['/api/admin/probe/../status', '/api/admin/probe/%2e%2e/status']) {
      const body = await (await t.fetch(path, { cookie: adminCookie })).json()
      expect(body, path).not.toHaveProperty('escaped')
      expect(body, path).toHaveProperty('games')
    }
  })

  it('parses JSON bodies for game routers', async () => {
    const res = await t.fetch('/api/admin/probe/echo', {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    })
    expect(await res.json()).toEqual({ body: { hello: 'world' } })
  })

  it('rejects state-changing admin requests with a missing or foreign Origin', async () => {
    for (const origin of ['https://evil.example', '']) {
      const res = await t.fetch('/api/admin/probe/echo', {
        method: 'POST',
        cookie: adminCookie,
        headers: { origin, 'content-type': 'application/json' },
        body: '{}',
      })
      expect(res.status, `origin ${JSON.stringify(origin)}`).toBe(403)
    }
  })

  it('rejects sign-in from a foreign Origin (Better Auth trustedOrigins)', async () => {
    const res = await t.fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'test-password-123' }),
    })
    expect(res.status).toBe(403)
  })

  it('serves /api/config publicly without secrets', async () => {
    const body = await (await t.fetch('/api/config')).json()
    expect(body).toEqual({ appName: 'Family Games', primaryColor: '#6750A4', aiEnabled: false })
  })

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await t.fetch('/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'not_found' })
  })
})

describe('auth rate limit', () => {
  it('limits sign-in attempts per real client IP, ignoring spoofed X-Forwarded-For', async () => {
    const limited = await startTestServer({ authRateLimit: true })
    try {
      const attempt = (xff: string) =>
        limited.fetch('/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': xff, 'x-wsfg-client-ip': xff },
          body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password' }),
        })
      const statuses: number[] = []
      for (let i = 0; i < 7; i++) statuses.push((await attempt(`10.0.0.${i}`)).status)
      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true)
      expect(statuses.at(-1)).toBe(429)
    } finally {
      await limited.close()
    }
  })
})
