/** Passkeys through Better Auth's plugin, driven end to end by a software authenticator. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRecoveryCode } from '../src/recovery.ts'
import { BITWARDEN_AAGUID, softPasskey, type SoftPasskey } from './helpers/passkey.ts'
import { ORIGIN, startTestServer, type TestServer } from './helpers/server.ts'

let t: TestServer
let adminCookie: string

/** Merge Set-Cookie into a Cookie header: the challenge cookie rides alongside the session. */
const withCookies = (cookie: string, res: Response) => {
  const jar = new Map(cookie.split('; ').filter(Boolean).map((c) => [c.split('=')[0]!, c]))
  for (const c of res.headers.getSetCookie()) jar.set(c.split('=')[0]!, c.split(';')[0]!)
  return [...jar.values()].join('; ')
}
const post = (path: string, body: unknown, cookie = '') =>
  t.fetch(path, { method: 'POST', cookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function addPasskey(cookie: string, key: SoftPasskey, name: string | null = 'Test key', origin = ORIGIN) {
  const optionsRes = await t.fetch('/api/auth/passkey/generate-register-options', { cookie })
  if (!optionsRes.ok) return optionsRes
  const options = (await optionsRes.json()) as Parameters<SoftPasskey['register']>[0]
  return post('/api/auth/passkey/verify-registration', { response: key.register(options, origin), name: name ?? undefined }, withCookies(cookie, optionsRes))
}

/** Signs in with the passkey; returns the response and the cookies a browser would then hold. */
async function signInWith(key: SoftPasskey, origin = ORIGIN) {
  const optionsRes = await t.fetch('/api/auth/passkey/generate-authenticate-options')
  const options = (await optionsRes.json()) as Parameters<SoftPasskey['authenticate']>[0]
  const res = await post('/api/auth/passkey/verify-authentication', { response: key.authenticate(options, origin) }, withCookies('', optionsRes))
  return { res, cookie: withCookies('', res) }
}

const sessionUser = async (cookie: string) =>
  ((await (await t.fetch('/api/auth/get-session', { cookie })).json()) as { user?: { email: string } } | null)?.user
const passkeyCount = (userId: string) =>
  (t.booted.authDb.prepare('SELECT count(*) AS n FROM passkey WHERE userId = ?').get(userId) as { n: number }).n

beforeAll(async () => {
  t = await startTestServer()
  await t.createUser('admin@example.com', 'admin')
  adminCookie = await t.signIn('admin@example.com')
}, 30_000)
afterAll(() => t.close())

describe('passkeys', () => {
  it('are added by a signed-in user, listed, and then sign them in', async () => {
    await t.createUser('keys@example.com', 'user')
    const cookie = await t.signIn('keys@example.com')
    const key = softPasskey()
    expect((await addPasskey(cookie, key, 'Bitwarden')).status).toBe(200)

    const list = (await (await t.fetch('/api/auth/passkey/list-user-passkeys', { cookie })).json()) as { name: string }[]
    expect(list.map((p) => p.name)).toEqual(['Bitwarden'])

    const { res, cookie: passkeyCookie } = await signInWith(key)
    expect(res.status).toBe(200)
    expect((await sessionUser(passkeyCookie))?.email).toBe('keys@example.com')
    // And again: the signature counter moves on.
    expect((await signInWith(key)).res.status).toBe(200)
  })

  it('are named after a known authenticator, and renamed under the name rule', async () => {
    await t.createUser('named@example.com', 'user')
    const cookie = await t.signIn('named@example.com')
    expect((await addPasskey(cookie, softPasskey({ aaguid: BITWARDEN_AAGUID }), null)).status).toBe(200)
    expect((await addPasskey(cookie, softPasskey(), null)).status).toBe(200)
    const list = async () =>
      (await (await t.fetch('/api/auth/passkey/list-user-passkeys', { cookie })).json()) as { id: string; name: string | null }[]
    const [bitwarden, unknown] = await list()
    expect(bitwarden!.name).toBe('Bitwarden')
    expect(unknown!.name ?? null).toBeNull()

    expect((await post('/api/auth/passkey/update-passkey', { id: bitwarden!.id, name: 'x'.repeat(41) }, cookie)).status).toBe(400)
    expect((await post('/api/auth/passkey/update-passkey', { id: bitwarden!.id, name: '  Vault  ' }, cookie)).status).toBe(200)
    expect((await list())[0]!.name).toBe('Vault')
  })

  it('need a session to add', async () => {
    expect((await addPasskey('', softPasskey())).status).toBe(401)
  })

  it('refuse a response made for another site', async () => {
    const user = await t.createUser('phish@example.com', 'user')
    const cookie = await t.signIn('phish@example.com')
    // Better Auth answers a failed registration with a 500.
    expect((await addPasskey(cookie, softPasskey(), 'Elsewhere', 'https://evil.example')).ok).toBe(false)
    expect(passkeyCount(user.id)).toBe(0)

    const key = softPasskey()
    expect((await addPasskey(cookie, key)).status).toBe(200)
    expect((await signInWith(key, 'https://evil.example')).res.status).toBe(400)
  })

  it('refuse an unknown key', async () => {
    expect((await signInWith(softPasskey())).res.status).toBe(401)
  })

  it('do not get a banned user in', async () => {
    const user = await t.createUser('banned-key@example.com', 'user')
    const key = softPasskey()
    expect((await addPasskey(await t.signIn('banned-key@example.com'), key)).status).toBe(200)
    expect((await post('/api/auth/admin/ban-user', { userId: user.id }, adminCookie)).status).toBe(200)
    const { res, cookie } = await signInWith(key)
    expect(res.status).toBe(403)
    expect(await sessionUser(cookie)).toBeUndefined()
  })

  it('are removed when an admin sets the password, or a recovery code is made', async () => {
    const reset = await t.createUser('reset-key@example.com', 'user')
    const key = softPasskey()
    expect((await addPasskey(await t.signIn('reset-key@example.com'), key)).status).toBe(200)
    expect((await post('/api/auth/admin/set-user-password', { userId: reset.id, newPassword: 'a-new-password-456' }, adminCookie)).status).toBe(200)
    expect(passkeyCount(reset.id)).toBe(0)
    expect((await signInWith(key)).res.status).toBe(401)

    const recovered = await t.createUser('recover-key@example.com', 'user')
    expect((await addPasskey(await t.signIn('recover-key@example.com'), softPasskey())).status).toBe(200)
    expect((await createRecoveryCode(t.booted.auth, 'recover-key@example.com')).ok).toBe(true)
    expect(passkeyCount(recovered.id)).toBe(0)
  })

  it('stay put when the user changes their own password', async () => {
    const user = await t.createUser('change-key@example.com', 'user')
    const cookie = await t.signIn('change-key@example.com')
    expect((await addPasskey(cookie, softPasskey())).status).toBe(200)
    const changed = await post('/api/auth/change-password', { currentPassword: 'test-password-123', newPassword: 'changed-password-1' }, cookie)
    expect(changed.status).toBe(200)
    expect(passkeyCount(user.id)).toBe(1)
  })

  it('go with a deleted user', async () => {
    const user = await t.createUser('gone-key@example.com', 'user')
    expect((await addPasskey(await t.signIn('gone-key@example.com'), softPasskey())).status).toBe(200)
    expect((await post('/api/auth/admin/remove-user', { userId: user.id }, adminCookie)).status).toBe(200)
    expect(passkeyCount(user.id)).toBe(0)
  })

  it('limit sign-in attempts', async () => {
    const limited = await startTestServer({ authRateLimit: true })
    try {
      const statuses: number[] = []
      for (let i = 0; i < 12; i++) {
        const res = await limited.fetch('/api/auth/passkey/verify-authentication', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-ogn-client-ip': '10.9.9.9' },
          body: JSON.stringify({ response: {} }),
        })
        statuses.push(res.status)
      }
      expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true)
      expect(statuses.at(-1)).toBe(429)
    } finally {
      await limited.close()
    }
  }, 30_000)
})
