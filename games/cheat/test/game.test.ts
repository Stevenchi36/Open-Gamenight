import { assertValidGame } from '@wsfg/core/contract'
import { DISCONNECT_GRACE_MS } from '@wsfg/core/kit'
import { describe, expect, it } from 'vitest'
import { cheat } from '../server/game.ts'
import { allowedClaims } from '../shared/index.ts'
import { act, cards, newGame, PLAYERS, playCodes, setTable, waitOutCall } from './helpers.ts'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(cheat)).not.toThrow()
  })
})

describe('the deal', () => {
  it('deals the whole deck, the first seats getting the extra cards, and shows each player only their own hand', () => {
    const sim = newGame()
    const sizes = sim.state.seats.map((id) => sim.state.hands[id]!.length)
    expect(sizes).toEqual([18, 17, 17])
    for (const id of PLAYERS) {
      const v = sim.view(id)
      expect(v.you.status).toBe('playing')
      expect(v.you.hand.map((c) => c.rank + c.suit).sort()).toEqual(sim.state.hands[id]!.map((c) => c.rank + c.suit).sort())
      expect(v.seats.map((s) => s.cards)).toEqual(sizes)
    }
    expect(sim.state.turn).toBe(sim.state.seats[0])
    expect(sim.view('p1')).toMatchObject({ pile: 0, top: null, claims: ['A'], stage: 'play', callUntil: null })
  })

  it('deals ten players five or six cards each', () => {
    const sim = newGame({ players: Array.from({ length: 10 }, (_, i) => `p${i + 1}`) })
    expect(sim.state.seats.map((id) => sim.state.hands[id]!.length)).toEqual([6, 6, 5, 5, 5, 5, 5, 5, 5, 5])
  })
})

describe('claims', () => {
  it('Next rank runs A to K and wraps; Nearby allows the same rank or a neighbour', () => {
    expect(allowedClaims('next', null)).toEqual(['A'])
    expect(allowedClaims('next', '7')).toEqual(['8'])
    expect(allowedClaims('next', 'K')).toEqual(['A'])
    expect(allowedClaims('nearby', null)).toHaveLength(13)
    expect(allowedClaims('nearby', '7')).toEqual(['6', '7', '8'])
    expect(allowedClaims('nearby', 'A')).toEqual(['K', 'A', '2'])
  })
})

describe('playing', () => {
  it('rejects plays out of turn, of cards not held or repeated, and of a wrong claim', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['AS', '7H'], ['2C'], ['3D']] })
    expect(sim.act(b!, playCodes('A', '2C'))).toEqual({ ok: false, error: "It's not your turn" })
    expect(sim.act(a!, playCodes('A', 'KS'))).toEqual({ ok: false, error: 'You can only play cards from your hand' })
    expect(sim.act(a!, playCodes('A', 'AS', 'AS'))).toEqual({ ok: false, error: 'Each card can only be played once' })
    expect(sim.act(a!, playCodes('2', 'AS'))).toEqual({ ok: false, error: "You can't claim that rank now" })
    expect(sim.act(a!, { type: 'play', cards: [], claim: 'A' })).toMatchObject({ ok: false })
  })

  it('a play goes face down, the turn moves on, and the next player waits out the call time', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['AS', '7H', '9C'], ['2C', '2D'], ['3D']] })
    act(sim, a!, playCodes('A', 'AS', '7H'))
    expect(sim.state.hands[a!]).toEqual(cards('9C'))
    const v = sim.view(b!)
    expect(v).toMatchObject({ pile: 2, turn: b, stage: 'calling', callUntil: 1_000_000 + 5000, claims: ['2'] })
    expect(v.top).toEqual({ play: 1, playerId: a, count: 2, claim: 'A' })
    expect(v.log).toEqual([{ kind: 'play', playerId: a, count: 2, claim: 'A' }])
    expect(sim.act(b!, playCodes('2', '2C'))).toEqual({ ok: false, error: 'Wait for the call time to end' })

    waitOutCall(sim)
    expect(sim.view(b!)).toMatchObject({ stage: 'play', callUntil: null })
    // The play can still be called until the next one goes down.
    expect(sim.view(b!).top?.play).toBe(1)
    act(sim, b!, playCodes('2', '2C', '2D'))
    expect(sim.view(a!).top).toEqual({ play: 2, playerId: b, count: 2, claim: '2' })
  })

  it('uses the call time from the settings', () => {
    const sim = newGame({ settings: { callSeconds: 10 } })
    const [a] = setTable(sim, { hands: [['AS', '9C'], ['2C'], ['3D']] })
    act(sim, a!, playCodes('A', 'AS'))
    expect(sim.view(a!).callUntil).toBe(1_000_000 + 10_000)
    sim.advance(5000)
    expect(sim.state.stage).toBe('calling')
  })

  it('with Nearby, a play may claim the same rank or a neighbour of the last claim', () => {
    const sim = newGame({ settings: { claims: 'nearby' } })
    const [a, b] = setTable(sim, { hands: [['5S', '9C'], ['2C', '3C'], ['3D']] })
    act(sim, a!, playCodes('5', '5S'))
    waitOutCall(sim)
    expect(sim.view(b!).claims).toEqual(['4', '5', '6'])
    expect(sim.act(b!, playCodes('7', '2C'))).toEqual({ ok: false, error: "You can't claim that rank now" })
    act(sim, b!, playCodes('4', '2C'))
  })
})

describe('calling', () => {
  it('a caught lie: the cards turn up and the liar picks up the whole pile; the turn stays put', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['7S', '9C'], ['2C'], ['3D']], pile: [[1, ['KH', 'QH'], 'K']], lastClaim: 'K' })
    act(sim, a!, playCodes('A', '7S'))
    act(sim, c!, { type: 'call', play: 1 })
    expect(sim.state.hands[a!]).toEqual(cards('9C', 'KH', 'QH', '7S'))
    const v = sim.view(c!)
    expect(v).toMatchObject({ pile: 0, top: null, turn: b, stage: 'play', claims: ['2'] })
    expect(v.log.at(-1)).toEqual({
      kind: 'call', callerId: c, playerId: a, count: 1, claim: 'A', cards: cards('7S'), lied: true, pickerId: a, picked: 3,
    })
    // The call ended the call time, so the next player can play at once.
    act(sim, b!, playCodes('2', '2C'))
  })

  it('a wrong call: the caller picks up the pile', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['AS', 'AH', '9C'], ['2C'], ['3D']] })
    act(sim, a!, playCodes('A', 'AS', 'AH'))
    act(sim, b!, { type: 'call', play: 1 })
    expect(sim.state.hands[b!]).toEqual(cards('2C', 'AS', 'AH'))
    expect(sim.view(c!).log.at(-1)).toMatchObject({ lied: false, pickerId: b, picked: 2 })
    expect(sim.state.turn).toBe(b)
  })

  it('refuses calling your own play, a stale play number, and a second call', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['AS', '9C', '2H'], ['2C', '3C'], ['3D']] })
    expect(sim.act(b!, { type: 'call', play: 1 })).toEqual({ ok: false, error: 'That play can no longer be called' })
    act(sim, a!, playCodes('A', 'AS'))
    expect(sim.act(a!, { type: 'call', play: 1 })).toEqual({ ok: false, error: "You can't call your own play" })
    waitOutCall(sim)
    act(sim, b!, playCodes('2', '2C'))
    // A tap meant for play 1 lands after play 2 covered it.
    expect(sim.act(c!, { type: 'call', play: 1 })).toEqual({ ok: false, error: 'That play can no longer be called' })
    act(sim, c!, { type: 'call', play: 2 })
    expect(sim.act(a!, { type: 'call', play: 2 })).toEqual({ ok: false, error: 'That play can no longer be called' })
  })

  it("lets a waiting late joiner watch but not call", () => {
    const sim = newGame()
    const [a] = setTable(sim, { hands: [['AS', '9C'], ['2C'], ['3D']] })
    sim.join({ id: 'late' })
    act(sim, a!, playCodes('A', '9C'))
    expect(sim.view('late').you).toEqual({ status: 'waiting', hand: [] })
    expect(sim.act('late', { type: 'call', play: 1 })).toEqual({ ok: false, error: "You're not in this game" })
  })
})

describe('going out', () => {
  it('playing your last cards wins once the call time passes uncalled', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['AS'], ['2C'], ['3D']] })
    act(sim, a!, playCodes('A', 'AS'))
    expect(sim.state.phase).toBe('PLAYING')
    waitOutCall(sim)
    const v = sim.view(c!)
    expect(v).toMatchObject({ phase: 'RESULTS', outcome: 'win', winnerId: a, turn: null, top: null })
    expect(v.scores).toEqual({ [a!]: 1, [b!]: 0, [c!]: 0 })
  })

  it('a true last play that is called wins at once, and the caller picks up', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['AS'], ['2C'], ['3D']] })
    act(sim, a!, playCodes('A', 'AS'))
    act(sim, b!, { type: 'call', play: 1 })
    expect(sim.state).toMatchObject({ phase: 'RESULTS', winnerId: a })
    expect(sim.state.hands[b!]).toHaveLength(2)
  })

  it('a lying last play that is called picks up the pile and play goes on', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['7S'], ['2C'], ['3D']] })
    act(sim, a!, playCodes('A', '7S'))
    act(sim, b!, { type: 'call', play: 1 })
    expect(sim.state.phase).toBe('PLAYING')
    expect(sim.state.hands[a!]).toEqual(cards('7S'))
    waitOutCall(sim)
    expect(sim.state.phase).toBe('PLAYING')
  })

  it('the host starts the next game: same seats round the table, first turn moved on one', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['AS'], ['2C'], ['3D']] })
    act(sim, a!, playCodes('A', 'AS'))
    waitOutCall(sim)
    const guest = [a, b, c].find((id) => id !== sim.hostId)!
    expect(sim.act(guest, { type: 'new_game' })).toEqual({ ok: false, error: 'Only the host can start a new game' })
    act(sim, sim.hostId, { type: 'new_game' })
    expect(sim.state).toMatchObject({ phase: 'PLAYING', game: 2, seats: [b, c, a], turn: b, plays: 0, lastClaim: null, log: [] })
    expect(sim.state.scores[a!]).toBe(1)
  })
})

describe('disconnects and leavers', () => {
  it("passes a disconnected player's turn after the grace, without a play; the claim stays the same", () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['AS', '9C'], ['2C'], ['3D']] })
    sim.disconnect(a!)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.turn).toBe(b)
    expect(sim.view(c!).log).toEqual([{ kind: 'skip', playerId: a }])
    expect(sim.view(b!).claims).toEqual(['A'])
    expect(sim.state.hands[a!]).toHaveLength(2)
  })

  it('a reconnect in time keeps the turn', () => {
    const sim = newGame()
    const [a] = setTable(sim, { hands: [['AS'], ['2C'], ['3D']] })
    sim.disconnect(a!)
    sim.advance(DISCONNECT_GRACE_MS - 1)
    sim.reconnect(a!)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.turn).toBe(a)
  })

  it("a leaver's hand is set aside, the turn moves on if it was theirs, and their play can't be called", () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['AS', '9C'], ['2C'], ['3D']] })
    act(sim, a!, playCodes('A', '9C'))
    sim.remove(b!)
    expect(sim.state.turn).toBe(c)
    expect(sim.view(c!).seats.find((s) => s.id === b)).toEqual({ id: b, cards: 0, left: true })
    expect(sim.noticesFor(a!)).toContain('A player left, so their cards were set aside.')
    sim.remove(a!)
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view(c!).outcome).toBe('abandoned')
  })

  it("the latest play stops being callable when its player leaves", () => {
    const sim = newGame({ players: ['p1', 'p2', 'p3', 'p4'] })
    const [a, , c] = setTable(sim, { hands: [['AS', '9C'], ['2C'], ['3D'], ['4D']] })
    act(sim, a!, playCodes('A', '9C'))
    sim.remove(a!)
    expect(sim.view(c!).top).toBeNull()
    expect(sim.act(c!, { type: 'call', play: 1 })).toEqual({ ok: false, error: 'That play can no longer be called' })
    waitOutCall(sim)
    expect(sim.state).toMatchObject({ phase: 'PLAYING', stage: 'play' })
  })
})
