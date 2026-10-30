/** Users changing their own password (Better Auth's change-password, from the account menu). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PASSWORD, startTestServer, type TestServer } from './helpers/server.ts'

let t: TestServer

const change = (server: TestServer, cookie: string, body: Record<string, unknown>, ip = '10.0.0.1') =>
  server.fetch('/api/auth/change-password', {
    method: 'POST',
    cookie,
    headers: { 'content-type': 'application/json', 'x-ogn-client-ip': ip },
    body: JSON.stringify(body),
  })
const signedIn = async (cookie: string) =>
  !!((await (await t.fetch('/api/auth/get-session', { cookie })).json()) as { user?: unknown } | null)?.user
const signInWith = (email: string, password: string) =>
  t.fetch('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })

beforeAll(async () => {
  t = await startTestServer()
}, 30_000)
afterAll(() => t.close())

describe('changing your own password', () => {
  it('needs the current password', async () => {
    await t.createUser('wrong@example.com', 'user')
    const cookie = await t.signIn('wrong@example.com')
    const res = await change(t, cookie, { currentPassword: 'not-my-password', newPassword: 'brand-new-password' })
    expect(res.ok).toBe(false)
    expect((await signInWith('wrong@example.com', PASSWORD)).status).toBe(200)
  })

  it('changes it, and can sign out every other device', async () => {
    await t.createUser('me@example.com', 'user')
    const here = await t.signIn('me@example.com')
    const elsewhere = await t.signIn('me@example.com')
    const res = await change(t, here, { currentPassword: PASSWORD, newPassword: 'brand-new-password', revokeOtherSessions: true })
    expect(res.status).toBe(200)
    expect((await signInWith('me@example.com', PASSWORD)).status).toBe(401)
    expect((await signInWith('me@example.com', 'brand-new-password')).status).toBe(200)
    expect(await signedIn(elsewhere)).toBe(false)
    // This device carries on with the new session cookie the response set.
    const renewed = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    expect(await signedIn(renewed)).toBe(true)
  })

  it('keeps other devices signed in when asked to', async () => {
    await t.createUser('keep@example.com', 'user')
    const here = await t.signIn('keep@example.com')
    const elsewhere = await t.signIn('keep@example.com')
    expect((await change(t, here, { currentPassword: PASSWORD, newPassword: 'brand-new-password', revokeOtherSessions: false })).status).toBe(200)
    expect(await signedIn(elsewhere)).toBe(true)
  })

  it('refuses a new password under 8 characters', async () => {
    await t.createUser('short@example.com', 'user')
    const cookie = await t.signIn('short@example.com')
    expect((await change(t, cookie, { currentPassword: PASSWORD, newPassword: 'short' })).ok).toBe(false)
  })

  it('limits guesses at the current password', async () => {
    const limited = await startTestServer({ authRateLimit: true })
    try {
      await limited.createUser('guess@example.com', 'user')
      const cookie = await limited.signIn('guess@example.com')
      const statuses: number[] = []
      for (let i = 0; i < 7; i++) {
        statuses.push((await change(limited, cookie, { currentPassword: `guess-${i}-guess`, newPassword: 'brand-new-password' }, '10.9.9.9')).status)
      }
      expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true)
      expect(statuses.at(-1)).toBe(429)
    } finally {
      await limited.close()
    }
  }, 30_000)
})
