import { assertValidGame } from '@wsfg/core/contract'
import { DISCONNECT_GRACE_MS } from '@wsfg/core/kit'
import { describe, expect, it } from 'vitest'
import { liarsDice } from '../server/game.ts'
import { countFace, isLegalBid, minQuantity, REVEAL_MS } from '../shared/index.ts'
import { act, newGame, nextSeat, PLAYERS, setDice } from './helpers.ts'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(liarsDice)).not.toThrow()
  })
})

describe('bid rules', () => {
  const bid = (quantity: number, face: number) => ({ quantity, face })

  it('raises by quantity, or by face at the same quantity', () => {
    expect(isLegalBid(bid(3, 4), bid(4, 2), false)).toBe(true)
    expect(isLegalBid(bid(3, 4), bid(3, 5), false)).toBe(true)
    expect(isLegalBid(bid(3, 4), bid(3, 4), false)).toBe(false)
    expect(isLegalBid(bid(3, 4), bid(3, 3), false)).toBe(false)
    expect(isLegalBid(bid(3, 4), bid(2, 6), false)).toBe(false)
  })

  it('without wild ones, ones are an ordinary (lowest) face', () => {
    expect(isLegalBid(null, bid(1, 1), false)).toBe(true)
    expect(isLegalBid(bid(2, 1), bid(2, 2), false)).toBe(true)
    expect(isLegalBid(bid(3, 4), bid(2, 1), false)).toBe(false)
  })

  it('with wild ones: no opening on ones, half to ones, double plus one back', () => {
    expect(isLegalBid(null, bid(1, 1), true)).toBe(false)
    expect(isLegalBid(null, bid(1, 2), true)).toBe(true)
    expect(isLegalBid(bid(5, 4), bid(3, 1), true)).toBe(true)
    expect(isLegalBid(bid(5, 4), bid(2, 1), true)).toBe(false)
    expect(isLegalBid(bid(3, 1), bid(4, 1), true)).toBe(true)
    expect(isLegalBid(bid(3, 1), bid(3, 1), true)).toBe(false)
    expect(isLegalBid(bid(3, 1), bid(7, 2), true)).toBe(true)
    expect(isLegalBid(bid(3, 1), bid(6, 6), true)).toBe(false)
  })

  it('minQuantity finds the smallest legal raise per face', () => {
    expect(minQuantity(null, 3, true)).toBe(1)
    expect(minQuantity(null, 1, true)).toBeNull()
    expect(minQuantity(null, 1, false)).toBe(1)
    expect(minQuantity({ quantity: 4, face: 3 }, 2, true)).toBe(5)
    expect(minQuantity({ quantity: 4, face: 3 }, 5, true)).toBe(4)
    expect(minQuantity({ quantity: 4, face: 3 }, 1, true)).toBe(2)
    expect(minQuantity({ quantity: 2, face: 1 }, 6, true)).toBe(5)
  })

  it('counts wild ones toward other faces only', () => {
    expect(countFace([1, 1, 3, 4, 4], 4, true)).toBe(4)
    expect(countFace([1, 1, 3, 4, 4], 4, false)).toBe(2)
    expect(countFace([1, 1, 3, 4, 4], 1, true)).toBe(2)
  })
})

describe('a round', () => {
  it('deals everyone the starting dice and shows each player only their own', () => {
    const sim = newGame()
    for (const id of PLAYERS) {
      const v = sim.view(id)
      expect(v.you.status).toBe('playing')
      expect(v.you.dice).toEqual(sim.state.dice[id])
      expect(v.you.dice).toHaveLength(5)
      expect(v.seats.map((s) => s.dice)).toEqual([5, 5, 5])
      expect(v.totalDice).toBe(15)
    }
    expect(sim.state.turn).toBe(sim.state.seats[0])
  })

  it('takes bids in seat order and rejects out-of-turn, low and impossible bids', () => {
    const sim = newGame()
    const [a, b, c] = sim.state.seats as [string, string, string]
    expect(sim.act(b, { type: 'bid', quantity: 2, face: 3 })).toEqual({ ok: false, error: "It's not your turn" })
    expect(sim.act(a, { type: 'bid', quantity: 2, face: 1 })).toEqual({ ok: false, error: "The opening bid can't be on ones" })
    expect(sim.act(a, { type: 'bid', quantity: 16, face: 3 })).toEqual({ ok: false, error: 'There are only 15 dice in play' })
    act(sim, a, { type: 'bid', quantity: 2, face: 3 })
    expect(sim.state.turn).toBe(b)
    expect(sim.act(b, { type: 'bid', quantity: 2, face: 2 })).toEqual({ ok: false, error: 'Your bid must be higher than the last one' })
    act(sim, b, { type: 'bid', quantity: 2, face: 4 })
    expect(sim.state.turn).toBe(c)
    expect(sim.view(a).bid).toEqual({ playerId: b, quantity: 2, face: 4 })
    expect(sim.view(a).bids).toHaveLength(2)
  })

  it('needs a bid before anyone can call', () => {
    const sim = newGame()
    expect(sim.act(sim.state.turn!, { type: 'call' })).toEqual({ ok: false, error: 'There is no bid to call yet' })
  })

  it('a true bid makes the caller lose a die; they open the next round', () => {
    const sim = newGame()
    const [a, b, c] = sim.state.seats as [string, string, string]
    setDice(sim, { [a]: [2, 2, 5, 5, 6], [b]: [1, 3, 3, 4, 6], [c]: [2, 2, 2, 3, 4] })
    act(sim, a, { type: 'bid', quantity: 6, face: 2 }) // five 2s plus one wild 1
    act(sim, b, { type: 'call' })
    expect(sim.state.phase).toBe('REVEAL')
    const last = sim.view(c).lastRound!
    expect(last).toMatchObject({ callerId: b, call: 'liar', count: 6, loserId: b, gainerId: null })
    expect(last.dice[a]).toEqual([2, 2, 5, 5, 6])
    expect(sim.view(c).seats.find((s) => s.id === b)!.dice).toBe(4)

    sim.advance(REVEAL_MS)
    expect(sim.state.phase).toBe('BIDDING')
    expect(sim.state.turn).toBe(b)
    expect(sim.state.dice[b]).toHaveLength(4)
    expect(sim.view(a).lastRound).toEqual(last)
  })

  it('a false bid makes the bidder lose a die', () => {
    const sim = newGame({ settings: { wildOnes: false } })
    const [a, b, c] = sim.state.seats as [string, string, string]
    setDice(sim, { [a]: [1, 1, 1, 1, 1], [b]: [1, 3, 3, 4, 6], [c]: [2, 2, 2, 3, 4] })
    act(sim, a, { type: 'bid', quantity: 4, face: 2 }) // only three 2s: ones aren't wild
    act(sim, b, { type: 'call' })
    expect(sim.state.lastRound).toMatchObject({ count: 3, loserId: a })
    expect(sim.state.diceCount[a]).toBe(4)
  })

  it('a player whose turn comes round again cannot call their own bid', () => {
    const sim = newGame({ players: ['p1', 'p2'] })
    const [a, b] = sim.state.seats as [string, string]
    act(sim, a, { type: 'bid', quantity: 2, face: 3 })
    sim.disconnect(b)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.turn).toBe(a)
    expect(sim.act(a, { type: 'call' })).toEqual({ ok: false, error: "You can't call your own bid" })
    act(sim, a, { type: 'bid', quantity: 3, face: 3 })
  })
})

describe('spot on', () => {
  it('is rejected when the setting is off', () => {
    const sim = newGame()
    act(sim, sim.state.turn!, { type: 'bid', quantity: 2, face: 3 })
    expect(sim.act(sim.state.turn!, { type: 'spot_on' })).toEqual({ ok: false, error: 'Spot on is off in this game' })
  })

  it('an exact count gives the caller a die back, never above the starting dice', () => {
    const sim = newGame({ settings: { spotOn: true, startingDice: 3 } })
    const [a, b, c] = sim.state.seats as [string, string, string]
    setDice(sim, { [a]: [3, 3], [b]: [1, 5], [c]: [2, 4, 6] })
    act(sim, a, { type: 'bid', quantity: 3, face: 3 })
    act(sim, b, { type: 'spot_on' })
    expect(sim.state.lastRound).toMatchObject({ count: 3, gainerId: b, loserId: null })
    expect(sim.state.diceCount[b]).toBe(3)
    sim.advance(REVEAL_MS)
    expect(sim.state.turn).toBe(b)
  })

  it('caps the gain at the starting dice', () => {
    const sim = newGame({ settings: { spotOn: true, startingDice: 2 } })
    const [a, b, c] = sim.state.seats as [string, string, string]
    setDice(sim, { [a]: [3, 3], [b]: [5, 5], [c]: [2, 4] })
    act(sim, a, { type: 'bid', quantity: 2, face: 3 })
    act(sim, b, { type: 'spot_on' })
    expect(sim.state.diceCount[b]).toBe(2)
  })

  it('a wrong count costs the caller a die', () => {
    const sim = newGame({ settings: { spotOn: true } })
    const [a, b] = sim.state.seats as [string, string]
    setDice(sim, { ...sim.state.dice, [a]: [3, 3, 3, 3, 3] })
    act(sim, a, { type: 'bid', quantity: 1, face: 3 })
    act(sim, b, { type: 'spot_on' })
    expect(sim.state.lastRound!.loserId).toBe(b)
  })
})

describe('matches', () => {
  it('knocks out a player with no dice, and the next seat opens when the loser is out', () => {
    const sim = newGame({ settings: { startingDice: 1, wildOnes: false } })
    const [a, b, c] = sim.state.seats as [string, string, string]
    setDice(sim, { [a]: [4], [b]: [2], [c]: [6] })
    act(sim, a, { type: 'bid', quantity: 2, face: 4 })
    act(sim, b, { type: 'call' })
    expect(sim.state.lastRound!.loserId).toBe(a)
    sim.advance(REVEAL_MS)
    expect(sim.state.phase).toBe('BIDDING')
    expect(sim.state.turn).toBe(b)
    expect(sim.view(a).you).toEqual({ status: 'out', dice: [] })
    expect(sim.state.dice[a]).toBeUndefined()
    // Out players are skipped in turn order.
    act(sim, b, { type: 'bid', quantity: 1, face: 2 })
    expect(sim.state.turn).toBe(c)
    act(sim, c, { type: 'bid', quantity: 1, face: 3 })
    expect(sim.state.turn).toBe(b)
  })

  it('ends with the last player holding dice, who scores a point; the host starts the next match on new seats', () => {
    const sim = newGame({ players: ['p1', 'p2'], settings: { startingDice: 1, wildOnes: false } })
    const [a, b] = sim.state.seats as [string, string]
    setDice(sim, { [a]: [4], [b]: [2] })
    act(sim, a, { type: 'bid', quantity: 1, face: 4 })
    act(sim, b, { type: 'call' })
    sim.advance(REVEAL_MS)
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view(b).winnerId).toBe(a)
    expect(sim.view(b).scores).toEqual({ [a]: 1, [b]: 0 })

    expect(sim.act('p2', { type: 'new_match' })).toEqual({ ok: false, error: 'Only the host can start a new match' })
    act(sim, 'p1', { type: 'new_match' })
    expect(sim.state.phase).toBe('BIDDING')
    expect(sim.state.seats).toEqual([b, a])
    expect(sim.state.diceCount).toEqual({ [a]: 1, [b]: 1 })
    expect(sim.state.scores[a]).toBe(1)
  })

  it('seats late joiners at the next match', () => {
    const sim = newGame({ players: ['p1', 'p2'], settings: { startingDice: 1 } })
    sim.join({ id: 'p9' })
    expect(sim.view('p9').you).toEqual({ status: 'waiting', dice: [] })
    expect(sim.view('p9').seats.map((s) => s.id)).not.toContain('p9')
    const [a, b] = sim.state.seats as [string, string]
    setDice(sim, { [a]: [4], [b]: [2] })
    act(sim, a, { type: 'bid', quantity: 2, face: 4 })
    act(sim, b, { type: 'call' })
    sim.advance(REVEAL_MS)
    act(sim, 'p1', { type: 'new_match' })
    expect(sim.state.seats).toContain('p9')
    expect(sim.view('p9').you.status).toBe('playing')
  })
})

describe('disconnects and leavers', () => {
  it("passes a disconnected player's turn after the grace, keeping the bid", () => {
    const sim = newGame()
    const [a, b, c] = sim.state.seats as [string, string, string]
    act(sim, a, { type: 'bid', quantity: 2, face: 3 })
    sim.disconnect(b)
    sim.advance(DISCONNECT_GRACE_MS - 1)
    expect(sim.state.turn).toBe(b)
    sim.advance(1)
    expect(sim.state.turn).toBe(c)
    expect(sim.state.bids.at(-1)).toMatchObject({ playerId: a, quantity: 2 })
  })

  it('a reconnect in time keeps the turn', () => {
    const sim = newGame()
    const b = nextSeat(sim)
    act(sim, sim.state.turn!, { type: 'bid', quantity: 2, face: 3 })
    sim.disconnect(b)
    sim.reconnect(b)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.turn).toBe(b)
  })

  it('a turn landing on someone already disconnected is skipped after the grace', () => {
    const sim = newGame()
    const [a, b, c] = sim.state.seats as [string, string, string]
    sim.disconnect(b)
    act(sim, a, { type: 'bid', quantity: 2, face: 3 })
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.turn).toBe(c)
  })

  it('a player with dice leaving mid-round makes everyone re-roll, nobody losing a die', () => {
    const sim = newGame({ players: ['p1', 'p2', 'p3', 'p4'] })
    const [a, b, c] = sim.state.seats as [string, string, string]
    act(sim, a, { type: 'bid', quantity: 2, face: 3 })
    const round = sim.state.round
    sim.remove(b)
    expect(sim.state.round).toBe(round + 1)
    expect(sim.state.bids).toEqual([])
    expect(sim.state.turn).toBe(c)
    expect(sim.state.seats).not.toContain(b)
    expect(Object.values(sim.state.diceCount)).toEqual([5, 5, 5])
    expect(sim.noticesFor(a)).toEqual(['A player left, so everyone re-rolls.'])
  })

  it('ends the match without a winner when one player with dice is left', () => {
    const sim = newGame({ players: ['p1', 'p2'] })
    sim.remove('p2')
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.state.winnerId).toBeNull()
    expect(sim.state.scores).toEqual({ p1: 0 })
  })

  it('hands the next opening bid on when the starter leaves during the reveal', () => {
    const sim = newGame({ players: ['p1', 'p2', 'p3', 'p4'] })
    const [a, b, c] = sim.state.seats as [string, string, string]
    setDice(sim, { ...sim.state.dice, [a]: [1, 1, 1, 1, 1] })
    act(sim, a, { type: 'bid', quantity: 1, face: 2 })
    act(sim, b, { type: 'call' }) // b loses a die and would open
    sim.remove(b)
    sim.advance(REVEAL_MS)
    expect(sim.state.turn).toBe(c)
  })
})
