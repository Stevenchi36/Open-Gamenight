/** Changing account names: users rename themselves, admins rename anyone, both through the core rule. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestServer, type TestServer } from './helpers/server.ts'

let t: TestServer
let userCookie: string
let adminCookie: string
let userId: string

const post = (path: string, cookie: string, body: unknown) =>
  t.fetch(`/api/auth${path}`, { method: 'POST', cookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const nameOf = async (cookie: string) =>
  ((await (await t.fetch('/api/auth/get-session', { cookie })).json()) as { user: { name: string } }).user.name

beforeAll(async () => {
  t = await startTestServer()
  userId = (await t.createUser('user@example.com', 'user')).id
  await t.createUser('admin@example.com', 'admin')
  userCookie = await t.signIn('user@example.com')
  adminCookie = await t.signIn('admin@example.com')
}, 30_000)
afterAll(() => t.close())

describe('account names', () => {
  it('lets users rename themselves, trimmed', async () => {
    expect((await post('/update-user', userCookie, { name: '  Sam  ' })).status).toBe(200)
    expect(await nameOf(userCookie)).toBe('Sam')
  })

  it('lets admins rename anyone, trimmed', async () => {
    expect((await post('/admin/update-user', adminCookie, { userId, data: { name: ' Samantha ' } })).status).toBe(200)
    expect(await nameOf(userCookie)).toBe('Samantha')
  })

  it('rejects blank, too long and control-character names on every route', async () => {
    for (const name of ['   ', 'x'.repeat(41), 'a\nb']) {
      const self = await post('/update-user', userCookie, { name })
      const byAdmin = await post('/admin/update-user', adminCookie, { userId, data: { name } })
      const created = await post('/admin/create-user', adminCookie, { email: 'new@example.com', password: 'password-123', name })
      for (const res of [self, byAdmin, created]) {
        expect(res.status).toBe(400)
        expect(((await res.json()) as { message: string }).message).toMatch(/Name/)
      }
    }
    expect(await nameOf(userCookie)).toBe('Samantha')
  })

  it('trims names on admin-created accounts', async () => {
    const res = await post('/admin/create-user', adminCookie, { email: 'trim@example.com', password: 'password-123', name: ' Pat ' })
    expect(((await res.json()) as { user: { name: string } }).user.name).toBe('Pat')
  })

  it("doesn't let users rename anyone else", async () => {
    expect((await post('/admin/update-user', userCookie, { userId, data: { name: 'Mallory' } })).status).toBe(403)
  })
})
