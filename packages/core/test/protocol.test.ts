import { describe, expect, it } from 'vitest'
import { parseClientMessage, parseServerMessage } from '../src/protocol.ts'

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value))

describe('parseClientMessage', () => {
  it('accepts every core message type', () => {
    const messages = [
      { type: 'create_room' },
      { type: 'create_room', gameId: 'imposter', name: 'Sam' },
      { type: 'join_room', code: 'ABCD', name: 'Sam' },
      { type: 'reconnect', code: 'ABCD', token: 'x'.repeat(32) },
      { type: 'spectate_room', code: 'ABCD' },
      { type: 'leave' },
      { type: 'set_name', name: 'Sam' },
      { type: 'select_game', gameId: 'imposter' },
      { type: 'update_settings', settings: { rotations: 2 } },
      { type: 'start_game' },
      { type: 'return_to_lobby' },
      { type: 'transfer_host', playerId: 'p2' },
      { type: 'kick', playerId: 'p2' },
      { type: 'action', action: { type: 'cast_vote', targetId: 'p3' } },
    ]
    for (const m of messages) expect(parse(m), JSON.stringify(m)).toMatchObject({ ok: true })
  })

  it('normalizes room codes and trims names', () => {
    expect(parse({ type: 'join_room', code: ' abcd ', name: '  Sam  ' })).toEqual({
      ok: true,
      message: { type: 'join_room', code: 'ABCD', name: 'Sam' },
    })
  })

  it('enforces display name rules', () => {
    expect(parse({ type: 'set_name', name: '   ' }).ok).toBe(false)
    expect(parse({ type: 'set_name', name: 'x'.repeat(17) }).ok).toBe(false)
    expect(parse({ type: 'set_name', name: 'x'.repeat(16) }).ok).toBe(true)
    expect(parse({ type: 'set_name', name: 'a\u0000b' }).ok).toBe(false)
    expect(parse({ type: 'set_name', name: 'Zoë 🎲' }).ok).toBe(true)
  })

  it('rejects bad codes, game ids and tokens', () => {
    expect(parse({ type: 'join_room', code: 'ABC', name: 'Sam' }).ok).toBe(false)
    expect(parse({ type: 'join_room', code: 'AB1D', name: 'Sam' }).ok).toBe(false)
    expect(parse({ type: 'select_game', gameId: 'Imposter' }).ok).toBe(false)
    expect(parse({ type: 'select_game', gameId: 'drop_table' }).ok).toBe(false)
    expect(parse({ type: 'reconnect', code: 'ABCD', token: 'short' }).ok).toBe(false)
  })

  it('rejects invalid JSON, unknown types and non-objects without throwing', () => {
    expect(parseClientMessage('{not json')).toEqual({ ok: false, error: 'Message is not valid JSON' })
    expect(parse({ type: 'delete_everything' }).ok).toBe(false)
    expect(parse(null).ok).toBe(false)
    expect(parse([1, 2]).ok).toBe(false)
    expect(parse('join_room').ok).toBe(false)
  })

  it('strips unknown fields', () => {
    expect(parse({ type: 'leave', role: 'admin' })).toEqual({ ok: true, message: { type: 'leave' } })
  })
})

describe('parseServerMessage', () => {
  it('round-trips a state message', () => {
    const state = {
      type: 'state',
      room: {
        code: 'ABCD',
        phase: 'lobby',
        hostId: 'p1',
        game: { id: 'imposter', name: 'Word Imposter', settings: {} },
        availableGames: [{ id: 'imposter', name: 'Word Imposter', description: '', styles: ['deduction'], minPlayers: 3, maxPlayers: 12 }],
        players: [{ id: 'p1', name: 'Sam', connected: true, isHost: true, isLoggedIn: true }],
        spectators: 0,
        you: { id: 'p1' },
      },
      game: null,
      now: 1_700_000_000_000,
    }
    expect(parseServerMessage(JSON.stringify(state))).toEqual({ ok: true, message: state })
  })

  it('accepts errors and notices', () => {
    expect(parseServerMessage(JSON.stringify({ type: 'error', code: 'room_cap', message: 'Full' })).ok).toBe(true)
    expect(parseServerMessage(JSON.stringify({ type: 'notice', kind: 'server_restarting', message: 'Bye' })).ok).toBe(
      true,
    )
    expect(parseServerMessage(JSON.stringify({ type: 'error', code: 'oops', message: 'x' })).ok).toBe(false)
  })
})
