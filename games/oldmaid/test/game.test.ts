import { assertValidGame } from '@wsfg/core/contract'
import { DISCONNECT_GRACE_MS, RANKS } from '@wsfg/core/kit'
import { describe, expect, it } from 'vitest'
import { oldMaid } from '../server/game.ts'
import { pairKey } from '../shared/index.ts'
import { act, cards, codes, drawCard, newGame, PLAYERS, setTable } from './helpers.ts'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(oldMaid)).not.toThrow()
  })
})

describe('the deal', () => {
  it('deals all 51 cards, without the queen of clubs, and throws every pair', () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const matchColour of [false, true]) {
        const sim = newGame({ players: ['p1', 'p2', 'p3', 'p4'], seed, settings: { matchColour } })
        const held = Object.values(sim.state.hands).flat()
        expect(held.length + sim.state.discard.length * 2).toBe(51)
        expect([...held, ...sim.state.discard.flat()].some((c) => c.rank === 'Q' && c.suit === 'C')).toBe(false)
        for (const hand of Object.values(sim.state.hands)) {
          const keys = hand.map((c) => pairKey(c, matchColour))
          expect(new Set(keys).size).toBe(keys.length)
        }
        for (const [x, y] of sim.state.discard) expect(pairKey(x, matchColour)).toBe(pairKey(y, matchColour))
      }
    }
  })

  it('shows each player only their own hand, sorted', () => {
    const sim = newGame()
    for (const id of PLAYERS) {
      const v = sim.view(id)
      expect(v.you.status).toBe('playing')
      expect(codes(v.you.hand).sort()).toEqual(codes(sim.state.hands[id]!).sort())
      expect(v.seats.map((s) => s.id)).toEqual(sim.state.table)
      expect(v.seats.find((s) => s.id === id)!.cards).toBe(sim.state.hands[id]!.length)
    }
    expect(sim.state.turn).toBe(sim.state.table[0])
  })
})

describe('drawing', () => {
  it('rejects a draw out of turn or from a place that is not there', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['2S'], ['3S'], ['4S', '5S']] })
    expect(sim.act(b!, { type: 'draw', index: 0 })).toEqual({ ok: false, error: "It's not your turn" })
    expect(sim.act(a!, { type: 'draw', index: 2 })).toEqual({ ok: false, error: 'Pick one of their cards' })
  })

  it('takes from the previous player, and only the two of them see the card', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['2S'], ['3S'], ['4S', '4H']] })
    sim.state = { ...sim.state, hands: { ...sim.state.hands, [c!]: cards('4S', '5H') } }
    expect(sim.view(a!).from).toBe(c)
    drawCard(sim)
    expect(sim.state.hands[a!]).toHaveLength(2)
    expect(sim.state.hands[c!]).toHaveLength(1)
    expect(sim.state.turn).toBe(b)
    const taken = sim.state.log[0]!.card
    expect(sim.view(a!).log[0]!.card).toEqual(taken)
    expect(sim.view(c!).log[0]!.card).toEqual(taken)
    expect(sim.view(b!).log[0]!.card).toBeNull()
    expect(sim.view(b!).log[0]).toMatchObject({ drawerId: a, fromId: c, pair: null, out: [], away: false })
  })

  it('throws a pair made by the card taken, face up for everyone', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['7S', '2S'], ['3S'], ['7H', '5H']] })
    sim.state = { ...sim.state, settings: { ...sim.state.settings, arrange: true } }
    drawCard(sim, 0)
    expect(codes(sim.state.hands[a!]!)).toEqual(['2S'])
    expect(sim.view(b!).log[0]).toMatchObject({ card: cards('7H')[0], pair: cards('7S', '7H') })
    expect(sim.view(b!).discard).toEqual([cards('7S', '7H')])
    expect(sim.view(b!).seats.find((s) => s.id === a)!.pairs).toBe(1)
    expect(sim.state.turn).toBe(b)
    expect(sim.view(c!).from).toBe(a)
  })

  it('with Match colour, a rank of the other colour does not pair', () => {
    const sim = newGame({ settings: { matchColour: true, arrange: true } })
    const [a] = setTable(sim, { hands: [['7S'], ['3S'], ['7H', '5H']] })
    drawCard(sim, 0)
    expect(codes(sim.state.hands[a!]!).sort()).toEqual(['7H', '7S'])
  })

  it('skips players with no cards, both to draw from and for the turn', () => {
    const sim = newGame({ players: ['p1', 'p2', 'p3', 'p4'], settings: { arrange: true } })
    const [a, b, c, d] = setTable(sim, { hands: [['2S'], [], ['3S', '4S'], []] })
    expect(sim.view(a!).from).toBe(c)
    drawCard(sim, 1)
    expect(sim.state.turn).toBe(c)
    expect(sim.view(c!).from).toBe(a)
    expect([b, d].every((id) => sim.view(id!).you.status === 'out')).toBe(true)
  })

  it('records who goes out, giver and drawer', () => {
    const sim = newGame({ settings: { arrange: true } })
    const [a, b, c] = setTable(sim, { hands: [['7S', 'KS'], ['3S', 'KH'], ['7H']] })
    drawCard(sim, 0)
    expect(sim.state.log[0]!.out).toEqual([c])
    expect(sim.view(a!).seats.find((s) => s.id === c)!.outPlace).toBe(1)
    expect(sim.state.turn).toBe(b)
    expect(sim.view(b!).from).toBe(a)
  })
})

describe('the Old Maid', () => {
  it('is the last player holding a card; in Classic everyone else scores 1', () => {
    const sim = newGame({ settings: { arrange: true } })
    const [a, b, c] = setTable(sim, { hands: [['7S'], ['QS'], ['7H']] })
    drawCard(sim, 0) // a takes c's 7H: a and c are both out, b is left with the queen
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.state.out).toEqual([c, a])
    const v = sim.view(c!)
    expect(v).toMatchObject({ outcome: 'maid', maidId: b, maidCard: cards('QS')[0], turn: null, from: null, royaleGoesOn: false })
    expect(v.scores).toEqual({ [a!]: 1, [b!]: 0, [c!]: 1 })
  })

  it('with two players, taking the queen just passes it on', () => {
    const sim = newGame({ players: ['p1', 'p2'], settings: { arrange: true } })
    const [a, b] = setTable(sim, { hands: [['7S'], ['QS', '7H']] })
    act(sim, a!, { type: 'draw', index: 0 })
    expect(sim.state.turn).toBe(b)
    expect(sim.view(b!).from).toBe(a)
    act(sim, b!, { type: 'draw', index: sim.state.hands[a!]!.findIndex((c) => c.rank === '7') })
    expect(sim.state).toMatchObject({ phase: 'RESULTS', maidId: a })
  })

  it('the host deals the next round, with the first turn one seat on', () => {
    const sim = newGame({ settings: { arrange: true } })
    setTable(sim, { hands: [['7S'], ['QS'], ['7H']] })
    const first = sim.state.table[0]
    drawCard(sim, 0)
    expect(sim.act('p2', { type: 'next_round' })).toEqual({ ok: false, error: 'Only the host can start the next round' })
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.state.phase).toBe('PLAYING')
    expect(sim.state.game).toBe(2)
    expect(sim.state.table.at(-1)).toBe(first)
    expect(sim.state.scores).toEqual(sim.view('p1').scores)
  })
})

describe('Royale', () => {
  it('eliminates each Old Maid until one player is left, who wins the Royale', () => {
    const sim = newGame({ settings: { format: 'royale', arrange: true } })
    const [a, b, c] = setTable(sim, { hands: [['7S'], ['QS'], ['7H']] })
    drawCard(sim, 0)
    expect(sim.state.eliminated).toEqual([b])
    expect(sim.view(a!)).toMatchObject({ royaleGoesOn: true, royaleWinnerId: null })
    expect(Object.values(sim.state.scores)).toEqual([0, 0, 0])

    act(sim, 'p1', { type: 'next_round' })
    expect(sim.state).toMatchObject({ round: 2, game: 1, dealt: [a, c] })
    expect(sim.view(b!).you).toEqual({ status: 'eliminated', hand: [] })
    expect(sim.view(a!).seats.find((s) => s.id === b)).toMatchObject({ inRound: false, eliminated: true, cards: 0 })

    const [x, y] = setTable(sim, { hands: [['7S'], ['7H', 'QS']] })
    act(sim, x!, { type: 'draw', index: 0 }) // takes the 7H: x is out and y is the Old Maid
    expect(sim.state.maidId).toBe(y)
    expect(sim.view(b!)).toMatchObject({ royaleWinnerId: x, royaleGoesOn: false })
    expect(sim.state.scores[x!]).toBe(1)

    act(sim, 'p1', { type: 'next_round' })
    expect(sim.state).toMatchObject({ round: 1, game: 2, eliminated: [] })
    expect(sim.state.dealt).toHaveLength(3)
  })

  it('a late joiner waits for the next Royale', () => {
    const sim = newGame({ settings: { format: 'royale', arrange: true } })
    setTable(sim, { hands: [['7S'], ['QS'], ['7H']] })
    sim.join({ id: 'late' })
    expect(sim.view('late').you.status).toBe('waiting')
    drawCard(sim, 0)
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.state.dealt).not.toContain('late')
    expect(sim.view('late').you.status).toBe('waiting')
  })
})

describe('Classic late joiner', () => {
  it('is dealt in from the next round', () => {
    const sim = newGame({ settings: { arrange: true } })
    setTable(sim, { hands: [['7S'], ['QS'], ['7H']] })
    sim.join({ id: 'late' })
    expect(sim.view('late').you).toEqual({ status: 'waiting', hand: [] })
    drawCard(sim, 0)
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.state.dealt).toContain('late')
    expect(sim.state.scores.late).toBe(0)
  })
})

describe('Arrange hand', () => {
  it('lets a player reorder or shuffle their hand, and the draw picks from that order', () => {
    const sim = newGame({ settings: { arrange: true } })
    const [a, b, c] = setTable(sim, { hands: [['2S'], ['3S'], ['4S', '5S', '6S']] })
    expect(codes(sim.view(c!).you.hand)).toEqual(['4S', '5S', '6S'])
    act(sim, c!, { type: 'arrange', order: [2, 0, 1] })
    expect(codes(sim.view(c!).you.hand)).toEqual(['6S', '4S', '5S'])
    act(sim, b!, { type: 'shuffle' })
    drawCard(sim, 0)
    expect(sim.state.log[0]!.card).toEqual(cards('6S')[0])
    expect(sim.view(a!).log[0]!.index).toBe(0)
  })

  it('rejects an order that is not a permutation of the hand', () => {
    const sim = newGame({ settings: { arrange: true } })
    const [, , c] = setTable(sim, { hands: [['2S'], ['3S'], ['4S', '5S']] })
    for (const order of [[0], [0, 0], [0, 2], [1, 0, 2]]) {
      expect(sim.act(c!, { type: 'arrange', order })).toEqual({ ok: false, error: 'Your hand changed. Try again' })
    }
  })

  it('is refused when the setting is off; the hand still shows, and is drawn from, in its real order', () => {
    const sim = newGame()
    const [, , c] = setTable(sim, { hands: [['2S'], ['3S'], ['9S', '4S']] })
    expect(sim.act(c!, { type: 'arrange', order: [1, 0] })).toEqual({ ok: false, error: 'Arrange hand is off' })
    expect(codes(sim.view(c!).you.hand)).toEqual(['9S', '4S'])
    drawCard(sim, 1)
    expect(sim.state.log[0]!.card).toEqual(cards('4S')[0])
  })

  it('shuffling is up to each player, with or without the setting, and never happens by itself', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['2S', '5D'], ['3S', '6D', '7D', '8D'], ['9S', '4S', 'KH', 'JC']] })
    drawCard(sim, 0) // a takes from c; c's other cards keep their order
    expect(codes(sim.view(c!).you.hand)).toEqual(['4S', 'KH', 'JC'])
    expect(codes(sim.view(b!).you.hand)).toEqual(['3S', '6D', '7D', '8D'])
    const orders = new Set<string>()
    for (let i = 0; i < 10; i++) {
      act(sim, b!, { type: 'shuffle' })
      orders.add(codes(sim.view(b!).you.hand).join())
    }
    expect(orders.size).toBeGreaterThan(1)
    expect(sim.act(a!, { type: 'shuffle' })).toEqual({ ok: true })
  })

  it('never sorts a dealt hand', () => {
    const sorted = (hand: readonly { rank: string }[]) => hand.every((c, i) => i === 0 || RANKS.indexOf(hand[i - 1]!.rank as never) <= RANKS.indexOf(c.rank as never))
    const sim = newGame({ players: ['p1', 'p2'] })
    expect(PLAYERS.slice(0, 2).every((id) => sorted(sim.view(id).you.hand))).toBe(false)
  })

  it('puts a card received at a random place', () => {
    const places = new Set<number>()
    for (let seed = 1; seed <= 30; seed++) {
      const sim = newGame({ seed })
      const [a] = setTable(sim, { hands: [['2S', '3S', '4S'], ['5S'], ['9H']] })
      drawCard(sim, 0)
      places.add(codes(sim.view(a!).you.hand).indexOf('9H'))
    }
    expect(places.size).toBeGreaterThan(1)
  })
})

describe('disconnects', () => {
  it("draws a random card for a disconnected player's turn after the grace", () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['2S'], ['3S'], ['4S', '5S']] })
    sim.disconnect(a!)
    sim.advance(DISCONNECT_GRACE_MS - 1)
    expect(sim.state.turn).toBe(a)
    sim.advance(1)
    expect(sim.state.turn).toBe(b)
    expect(sim.state.log[0]).toMatchObject({ drawerId: a, away: true })
    expect(sim.state.hands[a!]).toHaveLength(2)
  })

  it('a reconnect in time cancels it', () => {
    const sim = newGame()
    const [a] = setTable(sim, { hands: [['2S'], ['3S'], ['4S', '5S']] })
    sim.disconnect(a!)
    sim.reconnect(a!)
    sim.advance(DISCONNECT_GRACE_MS * 2)
    expect(sim.state.turn).toBe(a)
    expect(sim.state.log).toEqual([])
  })
})

describe('a player leaving', () => {
  it('has their cards dealt round the players holding cards, pairs going down', () => {
    const sim = newGame({ players: ['p1', 'p2', 'p3', 'p4'] })
    const [a, b, c, d] = setTable(sim, { hands: [['2S', '9S'], ['3S'], ['4S', '5S'], ['2H', '3H', 'QS']] })
    sim.remove(d!)
    const held = [a, b, c].flatMap((id) => sim.state.hands[id!]!)
    expect(held.length + sim.state.discard.length * 2).toBe(8)
    expect(held.some((card) => card.rank === 'Q')).toBe(true)
    expect(sim.state.hands[d!]).toEqual([])
    expect(sim.view(a!).seats.find((s) => s.id === d)).toMatchObject({ left: true, cards: 0 })
    expect(sim.noticesFor(a!)).toContain('A player left, so their cards were dealt round the table.')
    expect(sim.state.phase).toBe('PLAYING')
    expect(sim.state.turn).toBe(a)
    expect(sim.view(a!).from).toBe(c)
    expect(sim.state.scores[d!]).toBeUndefined()
  })

  it('passes the turn on when it was theirs', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['2S'], ['3S'], ['4S', '5S']] })
    sim.remove(a!)
    expect(sim.state.turn).toBe(b)
  })

  it('ends the round with no points when fewer than 2 are left', () => {
    const sim = newGame({ players: ['p1', 'p2'] })
    const [a] = setTable(sim, { hands: [['2S'], ['3S', 'QS']] })
    sim.remove(a!)
    expect(sim.state).toMatchObject({ phase: 'RESULTS', outcome: 'abandoned', maidId: null })
    expect(Object.values(sim.state.scores)).toEqual([0])
  })

  it('in Royale, between rounds, can leave too few to go on', () => {
    const sim = newGame({ settings: { format: 'royale', arrange: true } })
    const [a, b, c] = setTable(sim, { hands: [['7S'], ['QS'], ['7H']] })
    drawCard(sim, 0)
    expect(sim.view(a!).royaleGoesOn).toBe(true)
    sim.remove(c!)
    expect(sim.view(a!).royaleGoesOn).toBe(false)
    expect(sim.noticesFor(a!)).toContain('Not enough players are left to finish the Royale.')
    act(sim, sim.hostId, { type: 'next_round' })
    expect(sim.state).toMatchObject({ game: 2, round: 1, eliminated: [] })
    expect(sim.state.dealt.sort()).toEqual([a, b].sort())
  })
})
