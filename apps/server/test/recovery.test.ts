/** Recovery codes: made by the server command, redeemed through Better Auth's /reset-password. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRecoveryCode, formatRecoveryCode, normalizeRecoveryCode } from '../src/recovery.ts'
import { PASSWORD, startTestServer, type TestServer } from './helpers/server.ts'

let t: TestServer

const redeem = (server: TestServer, code: string, newPassword = 'recovered-password', ip = '10.0.0.1') =>
  server.fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ogn-client-ip': ip },
    body: JSON.stringify({ token: normalizeRecoveryCode(code), newPassword }),
  })
const signIn = (email: string, password: string) =>
  t.fetch('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
const signedIn = async (cookie: string) =>
  !!((await (await t.fetch('/api/auth/get-session', { cookie })).json()) as { user?: unknown } | null)?.user
const code = async (email: string, options?: Parameters<typeof createRecoveryCode>[2]) => {
  const result = await createRecoveryCode(t.booted.auth, email, options)
  if (!result.ok) throw new Error(result.error)
  return result.code
}

beforeAll(async () => {
  t = await startTestServer()
}, 30_000)
afterAll(() => t.close())

describe('recovery codes', () => {
  it('look like ABCD-EFGH-JKMN and read back however they are typed', async () => {
    await t.createUser('format@example.com', 'user')
    const made = await code('format@example.com')
    expect(made).toMatch(/^[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}$/)
    expect(normalizeRecoveryCode(` ${made.toLowerCase().replace(/-/g, ' ')} `)).toBe(made.replace(/-/g, ''))
    expect(formatRecoveryCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN')
  })

  it('set a new password once, and sign the account out everywhere when made', async () => {
    await t.createUser('lost@example.com', 'admin')
    const cookie = await t.signIn('lost@example.com')
    const made = await code('lost@example.com')
    expect(await signedIn(cookie)).toBe(false)

    expect((await redeem(t, made.toLowerCase())).status).toBe(200)
    expect((await signIn('lost@example.com', PASSWORD)).status).toBe(401)
    expect((await signIn('lost@example.com', 'recovered-password')).status).toBe(200)
    expect((await redeem(t, made, 'another-password')).status).toBe(400)
  })

  it('are stored only as a hash', async () => {
    await t.createUser('hashed@example.com', 'user')
    const made = normalizeRecoveryCode(await code('hashed@example.com'))
    const rows = t.booted.authDb.prepare('SELECT identifier FROM verification').all() as { identifier: string }[]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((r) => r.identifier.includes(made))).toBe(false)
  })

  it('void the earlier code when a new one is made', async () => {
    await t.createUser('twice@example.com', 'user')
    const first = await code('twice@example.com')
    const second = await code('twice@example.com')
    expect((await redeem(t, first)).status).toBe(400)
    expect((await redeem(t, second)).status).toBe(200)
  })

  it('stop working when they expire', async () => {
    await t.createUser('late@example.com', 'user')
    const made = await code('late@example.com', { now: Date.now() - 25 * 60 * 60_000 })
    expect((await redeem(t, made)).status).toBe(400)
    expect((await signIn('late@example.com', PASSWORD)).status).toBe(200)
  })

  it('refuse a short password and stay usable', async () => {
    await t.createUser('short@example.com', 'user')
    const made = await code('short@example.com')
    expect((await redeem(t, made, 'short')).status).toBe(400)
    expect((await redeem(t, made)).status).toBe(200)
  })

  it('report an unknown email instead of making a code', async () => {
    expect(await createRecoveryCode(t.booted.auth, 'nobody@example.com')).toMatchObject({ ok: false, error: expect.stringContaining('nobody@example.com') })
  })

  it('limit guesses', async () => {
    const limited = await startTestServer({ authRateLimit: true })
    try {
      const statuses: number[] = []
      for (let i = 0; i < 7; i++) statuses.push((await redeem(limited, `AAAA-BBBB-CCC${i}`, 'recovered-password', '10.8.8.8')).status)
      expect(statuses.slice(0, 5).every((s) => s === 400)).toBe(true)
      expect(statuses.at(-1)).toBe(429)
    } finally {
      await limited.close()
    }
  }, 30_000)
})
