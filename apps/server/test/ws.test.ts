import { MAX_PAYLOAD_BYTES } from '@wsfg/core/protocol'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect } from './helpers/client.ts'
import { startTestServer, type TestServer } from './helpers/server.ts'

let t: TestServer
let cookie: string

beforeAll(async () => {
  t = await startTestServer({ ws: { maxConnectionsPerIp: 6, messagesPerSecond: 10 } })
  await t.createUser('host@example.com', 'user', 'Hosty')
  cookie = await t.signIn('host@example.com')
})
afterAll(() => t.close())

describe('upgrade checks', () => {
  it('rejects other paths with 404 before the handshake', async () => {
    await expect(connect(t.wsUrl.replace('/ws', '/socket'))).rejects.toThrow('HTTP 404')
  })

  it('rejects a foreign or missing Origin with 403', async () => {
    await expect(connect(t.wsUrl, { origin: 'https://evil.example' })).rejects.toThrow('HTTP 403')
    await expect(connect(t.wsUrl, { origin: '' })).rejects.toThrow('HTTP 403')
  })

  it('caps connections per IP with 429', async () => {
    const limited = await startTestServer({ ws: { maxConnectionsPerIp: 2 } })
    try {
      const a = await connect(limited.wsUrl)
      const b = await connect(limited.wsUrl)
      await expect(connect(limited.wsUrl)).rejects.toThrow('HTTP 429')
      a.close()
      await a.closed
      await new Promise((r) => setTimeout(r, 50))
      const c = await connect(limited.wsUrl)
      b.close()
      c.close()
    } finally {
      await limited.close()
    }
  })

  it('sends the session on connect: null for guests, the user when signed in', async () => {
    const guest = await connect(t.wsUrl)
    expect(await guest.next('session')).toMatchObject({ type: 'session', user: null })
    const signedIn = await connect(t.wsUrl, { cookie })
    expect((await signedIn.next('session')).user).toMatchObject({ name: 'Hosty', role: 'user' })
    guest.close()
    signedIn.close()
  })
})

describe('messages', () => {
  it('guests cannot create rooms; signed-in users can', async () => {
    const guest = await connect(t.wsUrl)
    guest.send({ type: 'create_room' })
    expect(await guest.next('error')).toMatchObject({ code: 'unauthorized' })
    const host = await connect(t.wsUrl, { cookie })
    host.send({ type: 'create_room' })
    const joined = await host.next('joined')
    expect(joined.code).toMatch(/^[A-Z]{4}$/)
    expect((await host.next('state')).room.players[0]).toMatchObject({ name: 'Hosty', isHost: true })
    host.send({ type: 'leave' })
    guest.close()
    host.close()
  })

  it('answers invalid JSON, unknown types and binary frames with a validation error', async () => {
    const c = await connect(t.wsUrl)
    c.ws.send('{nope')
    expect(await c.next('error')).toMatchObject({ code: 'validation', message: 'Message is not valid JSON' })
    c.send({ type: 'teleport' })
    expect(await c.next('error')).toMatchObject({ code: 'validation' })
    c.ws.send(Buffer.from([1, 2, 3]), { binary: true })
    expect(await c.next('error')).toMatchObject({ code: 'validation', message: 'Text messages only' })
    c.close()
  })

  it(`closes the socket (1009) on messages over ${MAX_PAYLOAD_BYTES} bytes`, async () => {
    const c = await connect(t.wsUrl)
    c.ws.send('x'.repeat(MAX_PAYLOAD_BYTES + 1))
    expect((await c.closed).code).toBe(1009)
  })

  it('rate-limits a chatty socket', async () => {
    const c = await connect(t.wsUrl)
    for (let i = 0; i < 15; i++) c.send({ type: 'leave' })
    expect(await c.next('error', (e) => e.code === 'rate_limited')).toMatchObject({ code: 'rate_limited' })
    c.close()
  })
})

describe('heartbeat', () => {
  it('terminates a socket that stops answering pings and marks the player disconnected', async () => {
    const fast = await startTestServer({ ws: { heartbeatMs: 100 } })
    try {
      await fast.createUser('hb@example.com', 'user', 'Beat')
      const hostCookie = await fast.signIn('hb@example.com')
      const host = await connect(fast.wsUrl, { cookie: hostCookie })
      host.send({ type: 'create_room' })
      const { code } = await host.next('joined')

      const silent = await connect(fast.wsUrl, { autoPong: false })
      silent.send({ type: 'join_room', code, name: 'Silent' })
      await silent.next('joined')

      // stays connected well past several heartbeats because it answers pings
      await new Promise((r) => setTimeout(r, 350))
      expect(host.ws.readyState).toBe(host.ws.OPEN)

      const closed = await silent.closed
      expect(closed.code).toBe(1006) // terminated, no close frame
      const state = await host.next('state', (s) => s.room.players.some((p) => p.name === 'Silent' && !p.connected))
      expect(state.room.players.find((p) => p.name === 'Silent')?.connected).toBe(false)
      host.close()
    } finally {
      await fast.close()
    }
  })
})

describe('shutdown', () => {
  it('sends server_restarting to every player and closes sockets with 1012', async () => {
    const s = await startTestServer()
    try {
      await s.createUser('sd@example.com', 'user', 'Down')
      const host = await connect(s.wsUrl, { cookie: await s.signIn('sd@example.com') })
      host.send({ type: 'create_room' })
      await host.next('state')
      const notice = host.next('notice')
      await s.ws.shutdown()
      expect(await notice).toMatchObject({ kind: 'server_restarting' })
      expect((await host.closed).code).toBe(1012)
    } finally {
      await s.close()
    }
  })
})
