import { defineGame } from '@wsfg/core/contract'
import { MAX_SPECTATORS, SPECTATOR_ID } from '@wsfg/core/protocol'
import { games as registry } from '@wsfg/games/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { HOST_GRACE_MS, ROOM_EMPTY_MS, ROOM_IDLE_MS } from '../src/rooms.ts'
import { createManager, FakeConn, user } from './helpers/rooms.ts'

const imposter = registry[0]!

type CoinState = { flips: number; dings: number; sides: number }
type CoinAction = { type: 'flip' } | { type: 'stop' } | { type: 'end' } | { type: 'boom' }
type CoinTimer = { type: 'ding' }

/** Tiny second game: tests game switching, timers and gameOver. */
const coin = defineGame<CoinState, CoinAction, CoinTimer, CoinState, { sides: number }>({
  id: 'coin',
  name: 'Coin',
  description: 'Flip it',
  styles: ['party'],
  minPlayers: 1,
  maxPlayers: 2,
  settingsSchema: z.object({ sides: z.number().int().min(2).max(3) }),
  defaultSettings: { sides: 2 },
  actionSchema: z.discriminatedUnion('type', [
    z.object({ type: z.literal('flip') }),
    z.object({ type: z.literal('stop') }),
    z.object({ type: z.literal('end') }),
    z.object({ type: z.literal('boom') }),
  ]),
  init: (ctx) => ({ state: { flips: 0, dings: 0, sides: ctx.settings.sides } }),
  reduce(state, action, ctx) {
    switch (action.type) {
      case 'flip':
        return {
          state: { ...state, flips: state.flips + 1 },
          effects: [{ type: 'schedule', key: 'ding', at: ctx.now + 1000, action: { type: 'ding' } }],
        }
      case 'stop':
        return { state, effects: [{ type: 'cancel', key: 'ding' }] }
      case 'end':
        return { state, effects: [{ type: 'gameOver' }] }
      case 'boom':
        throw new Error('game bug')
    }
  },
  onTimer: (state) => ({
    state: { ...state, dings: state.dings + 1 },
    effects: [{ type: 'notice', to: 'all', message: 'ding' }],
  }),
  view: (state) => state,
})

const games = [imposter, coin]

async function roomWith(n: number, opts: Parameters<typeof createManager>[0] = {}) {
  const m = createManager({ games, ...opts })
  const host = new FakeConn(user('u1'))
  await m.send(host, { type: 'create_room', name: 'Host' })
  const code = host.last('joined')!.code
  const guests: FakeConn[] = []
  for (let i = 1; i < n; i++) {
    const g = new FakeConn(null, `10.0.0.${i + 1}`)
    await m.send(g, { type: 'join_room', code, name: `Guest${i}` })
    guests.push(g)
  }
  const room = m.rooms.rooms.get(code)!
  return { ...m, host, guests, code, room }
}

describe('create and join', () => {
  it('guests cannot create rooms', async () => {
    const m = createManager({ games })
    const guest = new FakeConn(null)
    await m.send(guest, { type: 'create_room' })
    expect(guest.last('error')).toMatchObject({ code: 'unauthorized' })
    expect(m.rooms.rooms.size).toBe(0)
  })

  it('creates a room with the default game and makes the creator host', async () => {
    const { host, room } = await roomWith(1)
    expect(room.code).toMatch(/^[A-HJ-NP-Z]{4}$/)
    const state = host.last('state')!
    expect(state.room).toMatchObject({ phase: 'lobby', game: { id: 'imposter' }, hostId: host.playerId })
    expect(state.room.players).toEqual([{ id: host.playerId, name: 'Host', connected: true, isHost: true, isLoggedIn: true }])
    expect(state.game).toBeNull()
  })

  it('prefills the account name when no name is given', async () => {
    const m = createManager({ games })
    const host = new FakeConn(user('u9'))
    await m.send(host, { type: 'create_room' })
    expect(host.last('state')!.room.players[0]!.name).toBe('User u9')
  })

  it('rejects unknown codes and duplicate names (case-insensitive)', async () => {
    const { send, code } = await roomWith(2)
    const c = new FakeConn()
    await send(c, { type: 'join_room', code: 'ZZZZ', name: 'X' })
    expect(c.last('error')).toMatchObject({ code: 'not_found' })
    await send(c, { type: 'join_room', code, name: 'guest1' })
    expect(c.last('error')).toMatchObject({ code: 'validation', message: expect.stringContaining('already called') })
  })

  it("enforces the game's max players", async () => {
    const m = await roomWith(12)
    const extra = new FakeConn()
    await m.send(extra, { type: 'join_room', code: m.code, name: 'Thirteen' })
    expect(extra.last('error')).toMatchObject({ code: 'room_cap', message: 'That room is full' })
  })

  it('rate-limits join attempts per IP', async () => {
    const { send } = await roomWith(1, { joinLimit: 3 })
    const c = new FakeConn(null, '9.9.9.9')
    for (let i = 0; i < 4; i++) await send(c, { type: 'join_room', code: 'ZZZZ', name: 'X' })
    expect(c.all('error').map((e) => e.code)).toEqual(['not_found', 'not_found', 'not_found', 'rate_limited'])
  })

  it('caps rooms per user and in total', async () => {
    const m = createManager({ games, maxRoomsPerUser: 1, maxRooms: 2 })
    const a = new FakeConn(user('a'))
    await m.send(a, { type: 'create_room' })
    await m.send(new FakeConn(user('a')), { type: 'create_room' })
    const second = new FakeConn(user('a'))
    await m.send(second, { type: 'create_room' })
    expect(second.last('error')).toMatchObject({ code: 'room_cap' })
    await m.send(new FakeConn(user('b')), { type: 'create_room' })
    const c = new FakeConn(user('c'))
    await m.send(c, { type: 'create_room' })
    expect(c.last('error')).toMatchObject({ code: 'room_cap', message: expect.stringContaining('full') })
  })
})

describe('reconnect', () => {
  it('reattaches with the token and marks the player connected again', async () => {
    const { rooms, send, guests, code, host } = await roomWith(2)
    const token = guests[0]!.last('joined')!.token
    await rooms.disconnected(guests[0]!)
    expect(host.last('state')!.room.players[1]!.connected).toBe(false)
    const phone = new FakeConn()
    await send(phone, { type: 'reconnect', code, token })
    expect(phone.last('joined')).toMatchObject({ code, playerId: guests[0]!.playerId })
    expect(host.last('state')!.room.players[1]!.connected).toBe(true)
  })

  it('rejects a bad token, and a second tab takes over the first', async () => {
    const { send, guests, code } = await roomWith(2)
    const bad = new FakeConn()
    await send(bad, { type: 'reconnect', code, token: 'x'.repeat(32) })
    expect(bad.last('error')).toMatchObject({ code: 'not_found' })

    const id = guests[0]!.playerId
    const tab2 = new FakeConn()
    await send(tab2, { type: 'reconnect', code, token: guests[0]!.last('joined')!.token })
    expect(guests[0]!.last('notice')).toMatchObject({ kind: 'removed' })
    expect(guests[0]!.room).toBeNull()
    expect(tab2.playerId).toBe(id)
  })

  it('a signed-in creator joining from another device gets their seat and host role back', async () => {
    const { send, code, host, room } = await roomWith(2)
    const id = host.playerId
    const laptop = new FakeConn(user('u1'))
    await send(laptop, { type: 'join_room', code, name: 'Whatever' })
    expect(laptop.playerId).toBe(id)
    expect(host.last('notice')).toMatchObject({ kind: 'removed' })
    expect(room.hostId).toBe(laptop.playerId)
    expect(room.players).toHaveLength(2)
  })
})

describe('lobby', () => {
  it('lets the host switch games (settings reset) and update settings with validation', async () => {
    const { send, host, guests, room } = await roomWith(2)
    await send(host, { type: 'update_settings', settings: { ...imposter.defaultSettings, rotations: 3 } })
    expect(room.settings).toMatchObject({ rotations: 3 })
    await send(host, { type: 'update_settings', settings: { rotations: 99 } })
    expect(host.last('error')).toMatchObject({ code: 'validation' })
    await send(guests[0]!, { type: 'select_game', gameId: 'coin' })
    expect(guests[0]!.last('error')).toMatchObject({ code: 'forbidden' })
    await send(host, { type: 'select_game', gameId: 'coin' })
    expect(room.settings).toEqual({ sides: 2 })
    await send(host, { type: 'select_game', gameId: 'imposter' })
    expect(room.settings).toEqual(imposter.defaultSettings)
  })

  it('renames in the lobby only', async () => {
    const { send, guests, host, room } = await roomWith(3)
    await send(guests[0]!, { type: 'set_name', name: 'Zed' })
    expect(room.players[1]!.name).toBe('Zed')
    await send(host, { type: 'start_game' })
    await send(guests[0]!, { type: 'set_name', name: 'Again' })
    expect(guests[0]!.last('error')).toMatchObject({ code: 'validation' })
  })

  it('checks min players and host-only start', async () => {
    const { send, host, guests } = await roomWith(2)
    await send(guests[0]!, { type: 'start_game' })
    expect(guests[0]!.last('error')).toMatchObject({ code: 'forbidden' })
    await send(host, { type: 'start_game' })
    expect(host.last('error')).toMatchObject({ code: 'validation', message: 'Need at least 3 players' })
  })

  it('transfers host (to a guest) and kicks', async () => {
    const { send, host, guests, room } = await roomWith(3)
    await send(host, { type: 'transfer_host', playerId: guests[0]!.playerId })
    expect(room.hostId).toBe(guests[0]!.playerId)
    await send(host, { type: 'kick', playerId: guests[1]!.playerId })
    expect(host.last('error')).toMatchObject({ code: 'forbidden' })
    const kicked = guests[1]!
    await send(guests[0]!, { type: 'kick', playerId: kicked.playerId })
    expect(kicked.last('notice')).toMatchObject({ kind: 'removed' })
    expect(kicked.room).toBeNull()
    expect(room.players.map((p) => p.name)).toEqual(['Host', 'Guest1'])
  })

  it('lets the host close the room from the lobby, sending everyone out', async () => {
    const { rooms, send, host, guests, room, code } = await roomWith(4)
    const tv = new FakeConn()
    await send(tv, { type: 'spectate_room', code })
    await send(guests[0]!, { type: 'close_room' })
    expect(guests[0]!.last('error')).toMatchObject({ code: 'forbidden' })
    await send(host, { type: 'start_game' })
    await send(host, { type: 'close_room' })
    expect(host.last('error')).toMatchObject({ code: 'validation', message: 'Only in the lobby' })
    await send(host, { type: 'return_to_lobby' })

    await send(host, { type: 'close_room' })
    expect(rooms.rooms.has(code)).toBe(false)
    expect(room.closed).toBe(true)
    expect(host.last('notice')).toBeUndefined()
    expect(host.room).toBeNull()
    for (const c of [...guests, tv]) {
      expect(c.last('notice')).toMatchObject({ kind: 'removed', message: 'The host closed the room.' })
      expect(c.room).toBeNull()
    }
  })

  it('passes host on when the host leaves and closes the room when the last player leaves', async () => {
    const { rooms, send, host, guests, room, code } = await roomWith(2)
    await send(host, { type: 'leave' })
    expect(room.hostId).toBe(guests[0]!.playerId)
    await send(guests[0]!, { type: 'leave' })
    expect(rooms.rooms.has(code)).toBe(false)
  })
})

describe('host migration', () => {
  it('moves host to the next connected player after ~2 minutes, not before', async () => {
    const { rooms, clock, settle, host, guests, room } = await roomWith(3)
    await rooms.disconnected(host)
    clock.advance(HOST_GRACE_MS - 1)
    await settle()
    expect(room.hostId).toBe(host.playerId)
    clock.advance(1)
    await settle()
    expect(room.hostId).toBe(guests[0]!.playerId)
    expect(guests[1]!.last('notice')?.message).toMatch(/is now the host/)
  })

  it('skips disconnected players and keeps host if the old host returns in time', async () => {
    const { rooms, clock, settle, host, guests, room } = await roomWith(3)
    await rooms.disconnected(guests[0]!)
    await rooms.disconnected(host)
    clock.advance(HOST_GRACE_MS)
    await settle()
    expect(room.hostId).toBe(guests[1]!.playerId)

    const m2 = await roomWith(2)
    await m2.rooms.disconnected(m2.host)
    m2.clock.advance(HOST_GRACE_MS / 2)
    const back = new FakeConn(user('u1'))
    await m2.send(back, { type: 'reconnect', code: m2.code, token: m2.host.last('joined')!.token })
    m2.clock.advance(HOST_GRACE_MS)
    await m2.settle()
    expect(m2.room.hostId).toBe(back.playerId)
  })
})

describe('running a game', () => {
  it('sends each player only their own view (the imposter never gets the word)', async () => {
    const { send, host, guests, room } = await roomWith(4)
    await send(host, { type: 'start_game' })
    expect(room.phase).toBe('playing')
    const state = room.game!.state as { imposterId: string; secret: { word: string } }
    for (const conn of [host, ...guests]) {
      const msg = conn.last('state')!
      expect(msg.room.phase).toBe('playing')
      const text = JSON.stringify(conn.inbox)
      if (conn.playerId === state.imposterId) expect(text).not.toContain(state.secret.word)
      else expect(msg.game).toMatchObject({ you: { role: 'crew', word: state.secret.word } })
      expect(text).not.toContain('"secret"')
    }
  })

  it('validates actions, sends game errors only to the actor', async () => {
    const { send, host, guests, room } = await roomWith(3)
    await send(host, { type: 'start_game' })
    await send(guests[0]!, { type: 'action', action: { type: 'nonsense' } })
    expect(guests[0]!.last('error')).toMatchObject({ code: 'validation' })
    const order = (room.game!.state as { turnOrder: string[] }).turnOrder
    const notTurn = [host, ...guests].find((c) => c.playerId !== order[0])!
    const others = [host, ...guests].filter((c) => c !== notTurn)
    for (const c of others) c.clear()
    await send(notTurn, { type: 'action', action: { type: 'submit_clue', word: 'hi' } })
    expect(notTurn.last('error')).toEqual({ type: 'error', code: 'game', message: "It's not your turn" })
    for (const c of others) expect(c.last('error')).toBeUndefined()
  })

  it('runs scheduled effects on the clock and delivers game notices', async () => {
    const m = createManager({ games: [coin] })
    const host = new FakeConn(user('u1'))
    await m.send(host, { type: 'create_room' })
    await m.send(host, { type: 'start_game' })
    await m.send(host, { type: 'action', action: { type: 'flip' } })
    // a player can't send a timer action
    await m.send(host, { type: 'action', action: { type: 'ding' } })
    expect(host.last('error')).toMatchObject({ code: 'validation' })
    m.clock.advance(999)
    await m.settle()
    expect(host.last('state')!.game).toMatchObject({ dings: 0 })
    m.clock.advance(1)
    await m.settle()
    expect(host.last('state')!.game).toMatchObject({ flips: 1, dings: 1 })
    expect(host.last('notice')).toMatchObject({ message: 'ding' })
  })

  it('drops a timer that fired while an action cancelling it was already queued', async () => {
    const m = createManager({ games: [coin] })
    const host = new FakeConn(user('u1'))
    await m.send(host, { type: 'create_room' })
    const room = [...m.rooms.rooms.values()][0]!
    await m.send(host, { type: 'start_game' })
    await m.send(host, { type: 'action', action: { type: 'flip' } })
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    void m.rooms.enqueue(room, () => gate)
    const stopped = m.send(host, { type: 'action', action: { type: 'stop' } })
    m.clock.advance(1000) // fires while 'stop' waits in the queue
    release()
    await stopped
    await m.settle()
    expect(host.last('state')!.game).toMatchObject({ dings: 0 })
  })

  it('returns to the lobby on gameOver or when the host says so, cancelling timers', async () => {
    const m = createManager({ games: [coin] })
    const host = new FakeConn(user('u1'))
    await m.send(host, { type: 'create_room' })
    const room = [...m.rooms.rooms.values()][0]!
    await m.send(host, { type: 'start_game' })
    await m.send(host, { type: 'action', action: { type: 'end' } })
    expect(room.phase).toBe('lobby')
    expect(host.last('state')!.game).toBeNull()
    await m.send(host, { type: 'start_game' })
    await m.send(host, { type: 'action', action: { type: 'flip' } })
    await m.send(host, { type: 'return_to_lobby' })
    m.clock.advance(5000)
    await m.settle()
    expect(room.phase).toBe('lobby')
    expect(host.last('notice')).toBeUndefined()
  })

  it('contains game bugs: logs, tells the actor, keeps the room alive', async () => {
    const m = createManager({ games: [coin] })
    const host = new FakeConn(user('u1'))
    await m.send(host, { type: 'create_room' })
    await m.send(host, { type: 'start_game' })
    await m.send(host, { type: 'action', action: { type: 'boom' } })
    expect(host.last('error')).toMatchObject({ code: 'game', message: 'Something went wrong in the game' })
    await m.send(host, { type: 'action', action: { type: 'flip' } })
    expect(host.last('state')!.game).toMatchObject({ flips: 1 })
  })

  it('calls disconnect/reconnect hooks (imposter turn skip after grace)', async () => {
    const { rooms, clock, settle, send, host, guests, room, code } = await roomWith(3)
    await send(host, { type: 'start_game' })
    const state = () => room.game!.state as { turnOrder: string[]; turnIndex: number }
    const first = [host, ...guests].find((c) => c.playerId === state().turnOrder[0])!
    await rooms.disconnected(first)
    clock.advance(15_000)
    await settle()
    expect(state().turnIndex).toBe(1)
    const back = new FakeConn(first.user)
    await send(back, { type: 'reconnect', code, token: first.last('joined')!.token })
    expect(back.last('state')!.room.players.find((p) => p.id === first.playerId)!.connected).toBe(true)
  })

  it('lets late joiners in while playing (they wait for the next round)', async () => {
    const { send, host, code } = await roomWith(3)
    await send(host, { type: 'start_game' })
    const late = new FakeConn()
    await send(late, { type: 'join_room', code, name: 'Late' })
    expect(late.last('state')!.game).toMatchObject({ you: { role: 'waiting', word: null } })
  })
})

describe('spectators', () => {
  it('watch with the public view, outside the player list, and players see the count', async () => {
    const { send, host, code, room } = await roomWith(3)
    const tv = new FakeConn()
    await send(tv, { type: 'spectate_room', code: code.toLowerCase() })
    expect(tv.last('state')!.room).toMatchObject({ code, you: { id: SPECTATOR_ID }, spectators: 1 })
    expect(tv.last('joined')).toBeUndefined()
    expect(room.players).toHaveLength(3)
    expect(host.last('state')!.room.spectators).toBe(1)

    await send(host, { type: 'start_game' })
    const state = room.game!.state as { secret: { word: string } }
    expect(tv.last('state')!.game).toMatchObject({ you: { role: 'waiting', word: null } })
    expect(JSON.stringify(tv.inbox)).not.toContain(state.secret.word)
  })

  it('can only leave: no lobby, host or game messages', async () => {
    const { send, host, code, room } = await roomWith(3)
    const tv = new FakeConn(user('u1'))
    await send(tv, { type: 'spectate_room', code })
    for (const msg of [{ type: 'start_game' }, { type: 'set_name', name: 'TV' }, { type: 'action', action: { type: 'x' } }]) {
      tv.clear()
      await send(tv, msg)
      expect(tv.last('error')).toMatchObject({ code: 'forbidden' })
    }
    expect(room.phase).toBe('lobby')

    await send(tv, { type: 'leave' })
    expect(room.spectators).toHaveLength(0)
    expect(tv.room).toBeNull()
    expect(host.last('state')!.room.spectators).toBe(0)
  })

  it("don't count toward max players and are capped per room", async () => {
    const { send, guests, code, room } = await roomWith(2, { games: [coin] })
    const watchers = Array.from({ length: MAX_SPECTATORS }, () => new FakeConn())
    for (const w of watchers) await send(w, { type: 'spectate_room', code })
    expect(room.spectators).toHaveLength(MAX_SPECTATORS)
    const extra = new FakeConn()
    await send(extra, { type: 'spectate_room', code })
    expect(extra.last('error')).toMatchObject({ code: 'room_cap' })
    expect(extra.room).toBeNull()
    expect(guests[0]!.last('state')!.room.players).toHaveLength(2)
  })

  it('rejects unknown codes and counts against the join limit', async () => {
    const m = createManager({ games, joinLimit: 1 })
    const tv = new FakeConn()
    await m.send(tv, { type: 'spectate_room', code: 'ZZZZ' })
    expect(tv.last('error')).toMatchObject({ code: 'not_found' })
    await m.send(tv, { type: 'spectate_room', code: 'ZZZZ' })
    expect(tv.last('error')).toMatchObject({ code: 'rate_limited' })
  })

  it('a player switching to watch keeps their seat, and can reconnect to it', async () => {
    const { send, guests, code, room } = await roomWith(3)
    const guest = guests[0]!
    const { playerId, token } = guest.last('joined')!
    await send(guest, { type: 'spectate_room', code })
    expect(room.players.find((p) => p.id === playerId)).toMatchObject({ conn: null })
    expect(room.spectators).toEqual([guest])
    expect(guest.last('state')!.room.you.id).toBe(SPECTATOR_ID)

    await send(guest, { type: 'reconnect', code, token })
    expect(room.spectators).toHaveLength(0)
    expect(guest.last('state')!.room.you.id).toBe(playerId)
    expect(room.players.find((p) => p.id === playerId)!.conn).toBe(guest)
  })

  it('a spectator joining as a player stops watching', async () => {
    const { send, code, room } = await roomWith(2)
    const tv = new FakeConn()
    await send(tv, { type: 'spectate_room', code })
    await send(tv, { type: 'join_room', code, name: 'Late' })
    expect(room.spectators).toHaveLength(0)
    expect(room.players.map((p) => p.name)).toContain('Late')
  })

  it("are dropped on disconnect, told when the room closes, and don't keep it alive", async () => {
    const a = await roomWith(2)
    const tv = new FakeConn()
    await a.send(tv, { type: 'spectate_room', code: a.code })
    await a.rooms.disconnected(tv)
    expect(a.room.spectators).toHaveLength(0)

    await a.send(tv, { type: 'spectate_room', code: a.code })
    await a.rooms.disconnected(a.host)
    await a.rooms.disconnected(a.guests[0]!)
    a.clock.advance(ROOM_EMPTY_MS + 1)
    a.rooms.sweep()
    expect(a.rooms.rooms.size).toBe(0)
    expect(tv.last('notice')).toMatchObject({ kind: 'removed', message: 'The room closed.' })
    expect(tv.room).toBeNull()

    const b = await roomWith(1)
    const tv2 = new FakeConn()
    await b.send(tv2, { type: 'spectate_room', code: b.code })
    await b.send(b.host, { type: 'leave' })
    expect(tv2.last('notice')).toMatchObject({ kind: 'removed' })
  })

  it('get the restart notice', async () => {
    const { send, rooms, code } = await roomWith(2)
    const tv = new FakeConn()
    await send(tv, { type: 'spectate_room', code })
    rooms.shutdown()
    expect(tv.last('notice')).toMatchObject({ kind: 'server_restarting' })
  })
})

describe('cleanup', () => {
  it('closes idle rooms and rooms nobody is connected to', async () => {
    const a = await roomWith(2)
    a.clock.advance(ROOM_IDLE_MS + 1)
    a.rooms.sweep()
    expect(a.rooms.rooms.size).toBe(0)
    expect(a.host.last('notice')).toMatchObject({ kind: 'removed' })

    const b = await roomWith(2)
    await b.rooms.disconnected(b.host)
    await b.rooms.disconnected(b.guests[0]!)
    b.rooms.sweep()
    expect(b.rooms.rooms.size).toBe(1)
    b.clock.advance(ROOM_EMPTY_MS + 1)
    b.rooms.sweep()
    expect(b.rooms.rooms.size).toBe(0)
  })

  it('lists open rooms for admins without tokens or game state', async () => {
    const { rooms, host, room } = await roomWith(2)
    await rooms.disconnected(host)
    expect(rooms.list()).toEqual([
      {
        code: room.code,
        gameId: 'imposter',
        gameName: imposter.name,
        phase: 'lobby',
        creatorName: 'User u1',
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        players: [
          { name: 'Host', connected: false, isHost: true, isLoggedIn: true },
          { name: 'Guest1', connected: true, isHost: false, isLoggedIn: false },
        ],
        spectators: 0,
      },
    ])
  })

  it('an admin close sends everyone out and frees the code', async () => {
    const { rooms, host, guests, code, room } = await roomWith(3)
    expect(await rooms.close(code)).toBe(true)
    expect(rooms.rooms.size).toBe(0)
    expect(room.closed).toBe(true)
    for (const c of [host, ...guests]) {
      expect(c.last('notice')).toMatchObject({ kind: 'removed', message: 'An admin closed this room.' })
      expect(c.room).toBeNull()
    }
    expect(await rooms.close(code)).toBe(false)
  })

  it('shutdown sends the restart notice to everyone connected', async () => {
    const { rooms, host, guests } = await roomWith(3)
    rooms.shutdown()
    for (const c of [host, ...guests]) expect(c.last('notice')).toMatchObject({ kind: 'server_restarting' })
  })
})
