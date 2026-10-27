import { defineGame } from '@ogn/core/contract'
import { games } from '@ogn/games/server'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { FakeConn, user } from './helpers/rooms.ts'
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

  it('does not let a user make themselves an admin', async () => {
    const post = (path: string, body: unknown) =>
      t.fetch(path, { method: 'POST', cookie: userCookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    await post('/api/auth/update-user', { role: 'admin' })
    const me = await t.fetch('/api/auth/admin/list-users', { cookie: userCookie })
    expect(me.status).toBe(403)
    const session = await t.fetch('/api/auth/get-session', { cookie: userCookie })
    expect(((await session.json()) as { user: { role: string } }).user.role).toBe('user')
    expect((await post('/api/auth/admin/set-role', { userId: 'anything', role: 'admin' })).status).toBe(403)
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

  it("signs a user out everywhere when an admin sets their password", async () => {
    const target = await t.createUser('reset@example.com', 'user')
    const cookie = await t.signIn('reset@example.com')
    const setPassword = (newPassword: string) =>
      t.fetch('/api/auth/admin/set-user-password', {
        method: 'POST',
        cookie: adminCookie,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: target.id, newPassword }),
      })
    const session = async () => ((await (await t.fetch('/api/auth/get-session', { cookie })).json()) as { user?: unknown } | null)?.user

    // A rejected reset (too short) leaves the session alone.
    expect((await setPassword('short')).status).toBe(400)
    expect(await session()).toBeDefined()

    expect((await setPassword('a-new-password-456')).status).toBe(200)
    expect(await session()).toBeUndefined()
  })
})

describe('core and game admin routes', () => {
  it.each(['/api/admin/status', '/api/admin/rooms', '/api/admin/probe/ping'])('%s: guest 401, user 403, admin 200', async (path) => {
    expect((await t.fetch(path)).status).toBe(401)
    expect((await t.fetch(path, { cookie: userCookie })).status).toBe(403)
    const res = await t.fetch(path, { cookie: adminCookie })
    expect(res.status).toBe(200)
  })

  it('lists open rooms and lets only an admin close one', async () => {
    const host = new FakeConn(user('u1'))
    await t.rooms.handle(host, { type: 'create_room', name: 'Host' })
    const code = host.last('joined')!.code
    const list = (await (await t.fetch('/api/admin/rooms', { cookie: adminCookie })).json()) as { rooms: { code: string }[] }
    expect(list.rooms.map((r) => r.code)).toEqual([code])

    const close = (cookie: string) => t.fetch(`/api/admin/rooms/${code}/close`, { method: 'POST', cookie })
    expect((await close(userCookie)).status).toBe(403)
    expect(t.rooms.rooms.has(code)).toBe(true)
    expect((await close(adminCookie)).status).toBe(200)
    expect(t.rooms.rooms.has(code)).toBe(false)
    expect(host.last('notice')).toMatchObject({ kind: 'removed' })
    expect((await close(adminCookie)).status).toBe(404)
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
    const body = (await (await t.fetch('/api/config')).json()) as { games: { id: string }[] }
    expect(body).toMatchObject({ appName: 'Open Gamenight', primaryColor: '#6750A4', aiEnabled: false })
    // Sorted by name, not registry order (imposter is registered first, as "Word Imposter").
    expect(body.games.map((g) => g.id)).toEqual(['probe', 'imposter'])
    expect(JSON.stringify(body)).not.toContain(t.booted.config.BETTER_AUTH_SECRET)
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
          headers: { 'content-type': 'application/json', 'x-forwarded-for': xff, 'x-ogn-client-ip': xff },
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

describe('public game routes', () => {
  it('serves read-only game data to anyone, and refuses writes', async () => {
    const res = await t.fetch('/api/games/imposter/categories')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ library: [], builtin: expect.arrayContaining(['Animals', 'Toys']) })
    const post = await t.fetch('/api/games/imposter/categories', { method: 'POST' })
    expect(post.status).toBe(405)
  })
})
