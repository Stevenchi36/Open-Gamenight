import { assertValidGame } from '@wsfg/core/contract'
import { DISCONNECT_GRACE_MS } from '@wsfg/core/kit'
import { describe, expect, it } from 'vitest'
import { lastCard } from '../server/game.ts'
import { canPlay, cardPoints, isWild, lastCardDeck, sortHand } from '../shared/index.ts'
import { act, card, cards, codesOf, newGame, PLAYERS, playCode, setTable } from './helpers.ts'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(lastCard)).not.toThrow()
  })
})

describe('the deck', () => {
  it('has 108 cards: per colour one 0, two of 1-9 and of each action, plus 4 of each wild', () => {
    const deck = lastCardDeck()
    expect(deck).toHaveLength(108)
    expect(deck.filter((c) => c.color === 'red')).toHaveLength(25)
    expect(deck.filter((c) => c.value === '0')).toHaveLength(4)
    expect(deck.filter((c) => c.value === 'draw2')).toHaveLength(8)
    expect(deck.filter((c) => c.value === 'wild')).toHaveLength(4)
    expect(deck.filter((c) => c.value === 'wild4')).toHaveLength(4)
  })

  it('scores numbers at face value, actions 20 and wilds 50', () => {
    expect(cards('r7', 'g0', 'bS', 'yR', 'r+2', 'W', 'W+4').map(cardPoints)).toEqual([7, 0, 20, 20, 20, 50, 50])
  })

  it('sorts a hand by colour, then value, wilds last', () => {
    expect(codesOf(sortHand(cards('W', 'b2', 'r+2', 'r3', 'y9', 'W+4')))).toEqual(['r3', 'r+2', 'y9', 'b2', 'W', 'W+4'])
  })
})

describe('what can be played', () => {
  const table = { top: card('r5'), color: 'red' as const, pendingDraw: 0 }
  it('matches colour or value, or any wild', () => {
    expect(canPlay(card('r9'), [], table)).toBe(true)
    expect(canPlay(card('g5'), [], table)).toBe(true)
    expect(canPlay(card('g6'), [], table)).toBe(false)
    expect(canPlay(card('W'), cards('r1'), table)).toBe(true)
  })

  it('allows a Wild Draw Four only without a card of the colour in play', () => {
    expect(canPlay(card('W+4'), cards('r1', 'g2'), table)).toBe(false)
    expect(canPlay(card('W+4'), cards('g5', 'b2'), table)).toBe(true)
  })

  it('matches a wild by the colour named for it', () => {
    const wild = { top: card('W'), color: 'blue' as const, pendingDraw: 0 }
    expect(canPlay(card('b3'), [], wild)).toBe(true)
    expect(canPlay(card('r3'), [], wild)).toBe(false)
  })

  it('answers a stack only with a Draw Two on a Draw Two, or a Wild Draw Four', () => {
    const two = { top: card('r+2'), color: 'red' as const, pendingDraw: 2 }
    const four = { top: card('W+4'), color: 'red' as const, pendingDraw: 4 }
    expect(canPlay(card('g+2'), [], two)).toBe(true)
    expect(canPlay(card('r5'), [], two)).toBe(false)
    expect(canPlay(card('W+4'), cards('r1'), two)).toBe(true)
    expect(canPlay(card('r+2'), [], four)).toBe(false)
    expect(canPlay(card('W+4'), [], four)).toBe(true)
  })
})

describe('the deal', () => {
  it('deals 7 each, turns up a non-wild and shows each player only their own hand', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const sim = newGame({ seed })
      const v = sim.view('p1')
      expect(isWild(v.top)).toBe(false)
      expect(v.color).toBe(v.top.color)
      expect(v.you.hand).toHaveLength(sim.state.hands.p1!.length)
      const inHands = Object.values(sim.state.hands).flat().length
      expect(inHands + sim.state.drawPile.length + sim.state.discard.length).toBe(108)
    }
  })

  it('applies the first card as if the dealer played it', () => {
    const tops = new Map<string, ReturnType<typeof newGame>>()
    for (let seed = 1; seed <= 400 && tops.size < 4; seed++) {
      const sim = newGame({ seed })
      const value = sim.state.discard[0]!.value
      if (['skip', 'reverse', 'draw2', '5'].includes(value) && !tops.has(value)) tops.set(value, sim)
    }
    const { seats } = tops.get('5')!.state
    expect(tops.get('5')!.state.turn).toBe(seats[0])
    // Skip: the first player is skipped.
    expect(tops.get('skip')!.state.turn).toBe(tops.get('skip')!.state.seats[1])
    // Reverse: the dealer goes first, anticlockwise.
    const rev = tops.get('reverse')!.state
    expect(rev.turn).toBe(rev.seats.at(-1))
    expect(rev.direction).toBe(-1)
    // Draw Two: the first player draws two and is skipped.
    const d2 = tops.get('draw2')!.state
    expect(d2.hands[d2.seats[0]!]).toHaveLength(9)
    expect(d2.turn).toBe(d2.seats[1])
  })
})

describe('playing', () => {
  it('plays a matching card and passes the turn; rejects out of turn, unheld or unmatched cards', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['r9', 'g6', 'b1'], ['r1', 'r2'], ['y1', 'y2']], top: 'r5' })
    expect(sim.act(b!, { type: 'play', card: card('r1') })).toEqual({ ok: false, error: "It's not your turn" })
    expect(sim.act(a!, { type: 'play', card: card('r3') })).toEqual({ ok: false, error: "You don't have that card" })
    expect(sim.act(a!, { type: 'play', card: card('g6') })).toEqual({ ok: false, error: "That card can't be played now" })
    playCode(sim, a!, 'r9')
    expect(sim.view(b!).top).toEqual(card('r9'))
    expect(sim.state.turn).toBe(b)
    expect(sim.view(b!).log).toEqual([{ kind: 'play', playerId: a, card: card('r9'), color: 'red', jumpIn: false, swapWith: null, called: false }])
  })

  it('a wild needs a colour, which is then in play', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['W', 'g6', 'b1'], ['b2', 'r2'], ['y1', 'y2']], top: 'r5' })
    expect(sim.act(a!, { type: 'play', card: card('W') })).toEqual({ ok: false, error: 'Choose a colour' })
    playCode(sim, a!, 'W', { color: 'blue' })
    expect(sim.view(b!).color).toBe('blue')
    expect(sim.act(b!, { type: 'play', card: card('r2') })).toEqual({ ok: false, error: "That card can't be played now" })
    playCode(sim, b!, 'b2')
  })

  it('Skip skips the next player', () => {
    const sim = newGame()
    const [a, , c] = setTable(sim, { hands: [['rS', 'g6'], ['r1'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'rS')
    expect(sim.state.turn).toBe(c)
  })

  it('Reverse changes direction', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['rR', 'g6'], ['r1', 'r2'], ['r3', 'r4']], top: 'r5' })
    playCode(sim, a!, 'rR')
    expect(sim.state.turn).toBe(c)
    playCode(sim, c!, 'r3')
    expect(sim.state.turn).toBe(b)
  })

  it('with two players Reverse acts as a Skip', () => {
    const sim = newGame({ players: ['p1', 'p2'] })
    const [a] = setTable(sim, { hands: [['rR', 'g6'], ['r1']], top: 'r5' })
    playCode(sim, a!, 'rR')
    expect(sim.state.turn).toBe(a)
  })

  it('Draw Two and Wild Draw Four make the next player draw and lose their turn', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['r+2', 'g6'], ['r1'], ['y1', 'W+4']], top: 'r5', pile: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'] })
    playCode(sim, a!, 'r+2')
    expect(sim.state.hands[b!]).toEqual(cards('r1', 'b1', 'b2'))
    expect(sim.state.turn).toBe(c)
    expect(sim.view(a!).log.at(-1)).toEqual({ kind: 'draw', playerId: b, count: 2, penalty: true, away: false })
    playCode(sim, c!, 'W+4', { color: 'green' })
    expect(sim.state.hands[a!]).toHaveLength(5)
    expect(sim.state.turn).toBe(b)
  })
})

describe('drawing', () => {
  it('draws one card; the drawer may play it if it fits, or keep it', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['g6', 'r1'], ['r1'], ['y1']], top: 'r5', pile: ['r7', 'b1'] })
    act(sim, a!, { type: 'draw' })
    expect(sim.view(a!).you.drawn).toEqual(card('r7'))
    expect(sim.view(b!).you.drawn).toBeNull()
    expect(sim.view(b!).stage).toBe('drawn')
    expect(sim.act(a!, { type: 'draw' })).toEqual({ ok: false, error: 'You have already drawn' })
    expect(sim.act(a!, { type: 'play', card: card('r1') })).toEqual({ ok: false, error: 'You can only play the card you drew' })
    playCode(sim, a!, 'r7')
    expect(sim.state.turn).toBe(b)
  })

  it('an unplayable drawn card is kept with a pass, not automatically', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['g6', 'r1'], ['r1'], ['y1']], top: 'r5', pile: ['b1'] })
    expect(sim.act(a!, { type: 'pass' })).toEqual({ ok: false, error: 'Play a card or draw first' })
    act(sim, a!, { type: 'draw' })
    expect(sim.state.turn).toBe(a)
    act(sim, a!, { type: 'pass' })
    expect(sim.state.turn).toBe(b)
    expect(sim.state.hands[a!]).toEqual(cards('g6', 'r1', 'b1'))
    expect(sim.view(b!).log.map((m) => m.kind)).toEqual(['draw', 'pass'])
  })

  it('with Draw until playable, draws until a card can be played', () => {
    const sim = newGame({ settings: { drawUntilPlayable: true } })
    const [a] = setTable(sim, { hands: [['g6'], ['r1'], ['y1']], top: 'r5', pile: ['b1', 'y2', 'r8', 'b4'] })
    act(sim, a!, { type: 'draw' })
    expect(sim.state.hands[a!]).toEqual(cards('g6', 'b1', 'y2', 'r8'))
    expect(sim.view(a!).you.drawn).toEqual(card('r8'))
    expect(sim.view(a!).log.at(-1)).toMatchObject({ kind: 'draw', count: 3 })
  })

  it('refills an empty draw pile from the discard pile, keeping the top card', () => {
    const sim = newGame()
    const [a] = setTable(sim, { hands: [['g6'], ['r1'], ['y1']], top: 'r5', discard: ['b9', 'y3'] })
    act(sim, a!, { type: 'draw' })
    expect(sim.state.hands[a!]).toHaveLength(2)
    expect(sim.state.discard).toEqual(cards('r5'))
    expect(sim.state.drawPile).toHaveLength(1)
  })

  it('with nothing left to draw, the turn just passes', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['g6'], ['r1'], ['y1']], top: 'r5' })
    act(sim, a!, { type: 'draw' })
    expect(sim.state.turn).toBe(b)
    expect(sim.view(b!).log.at(-1)).toMatchObject({ kind: 'draw', count: 0 })
  })
})

describe('stacking', () => {
  it('passes a growing stack on until someone draws it', () => {
    const sim = newGame({ settings: { stacking: true } })
    const [a, b, c] = setTable(sim, { hands: [['r+2', 'g6'], ['g+2', 'r1'], ['W+4', 'y1']], top: 'r5', pile: cards8() })
    playCode(sim, a!, 'r+2')
    expect(sim.state.turn).toBe(b)
    expect(sim.view(c!).pendingDraw).toBe(2)
    expect(sim.act(b!, { type: 'play', card: card('r1') })).toEqual({ ok: false, error: "That card can't be played now" })
    playCode(sim, b!, 'g+2')
    playCode(sim, c!, 'W+4', { color: 'yellow' })
    expect(sim.view(a!).pendingDraw).toBe(8)
    act(sim, a!, { type: 'draw' })
    expect(sim.state.hands[a!]).toHaveLength(9)
    expect(sim.state.turn).toBe(b)
    expect(sim.state.pendingDraw).toBe(0)
  })

  it('waits for a player facing a stack even when they hold nothing to answer it', () => {
    const sim = newGame({ settings: { stacking: true } })
    const [a, b] = setTable(sim, { hands: [['r+2', 'g6'], ['b1'], ['y1']], top: 'r5', pile: cards8() })
    playCode(sim, a!, 'r+2')
    expect(sim.state.turn).toBe(b)
    expect(sim.state.hands[b!]).toHaveLength(1)
  })
})

describe('7-0 swaps', () => {
  it('a 7 swaps hands with the chosen player', () => {
    const sim = newGame({ settings: { sevenZero: true } })
    const [a, b, c] = setTable(sim, { hands: [['r7', 'g6', 'g1'], ['r1'], ['y1', 'y2']], top: 'r5' })
    expect(sim.act(a!, { type: 'play', card: card('r7') })).toEqual({ ok: false, error: 'Choose a player to swap hands with' })
    expect(sim.act(a!, { type: 'play', card: card('r7'), swapWith: a })).toEqual({ ok: false, error: 'Choose a player to swap hands with' })
    playCode(sim, a!, 'r7', { swapWith: c })
    expect(sim.state.hands[a!]).toEqual(cards('y1', 'y2'))
    expect(sim.state.hands[c!]).toEqual(cards('g6', 'g1'))
    expect(sim.state.turn).toBe(b)
    expect(sim.view(b!).log.at(-1)).toMatchObject({ kind: 'play', swapWith: c })
  })

  it('a 0 passes every hand on in the direction of play', () => {
    const sim = newGame({ settings: { sevenZero: true } })
    const [a, b, c] = setTable(sim, { hands: [['r0', 'g6'], ['r1'], ['y1', 'y2']], top: 'r5' })
    playCode(sim, a!, 'r0')
    expect(sim.state.hands[b!]).toEqual(cards('g6'))
    expect(sim.state.hands[c!]).toEqual(cards('r1'))
    expect(sim.state.hands[a!]).toEqual(cards('y1', 'y2'))
  })

  it('without the setting a 7 is just a number', () => {
    const sim = newGame()
    const [a] = setTable(sim, { hands: [['r7', 'g6'], ['r1'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r7')
    expect(sim.state.hands[a!]).toEqual(cards('g6'))
  })
})

describe('jump-in', () => {
  it('an identical card can be played out of turn, and play carries on from the jumper', () => {
    const sim = newGame({ settings: { jumpIn: true } })
    const [a, b, c] = setTable(sim, { hands: [['r9', 'g6'], ['r1', 'b2'], ['r9', 'y1']], top: 'r5' })
    playCode(sim, a!, 'r9')
    expect(sim.state.turn).toBe(b)
    expect(sim.act(c!, { type: 'play', card: card('y1') })).toEqual({ ok: false, error: 'You can only jump in with a card identical to the top card' })
    playCode(sim, c!, 'r9')
    expect(sim.state.turn).toBe(a)
    expect(sim.view(b!).log.at(-1)).toMatchObject({ kind: 'play', playerId: c, jumpIn: true })
  })

  it('is refused without the setting', () => {
    const sim = newGame()
    const [a, , c] = setTable(sim, { hands: [['r9', 'g6'], ['r1'], ['r9', 'y1']], top: 'r5' })
    playCode(sim, a!, 'r9')
    expect(sim.act(c!, { type: 'play', card: card('r9') })).toEqual({ ok: false, error: "It's not your turn" })
  })
})

describe('last card', () => {
  it('calling as you play your second-to-last card keeps you safe', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['r9', 'g6'], ['r1'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r9', { lastCard: true })
    expect(sim.view(b!).exposed).toBeNull()
    expect(sim.view(b!).log.at(-1)).toMatchObject({ called: true })
    expect(sim.act(b!, { type: 'catch', targetId: a! })).toEqual({ ok: false, error: 'Too late: nobody to catch' })
  })

  it('a missed call can be caught for 2 cards until the next card is played or drawn', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['r9', 'g6'], ['r1', 'r2'], ['y1']], top: 'r5', pile: ['b1', 'b2'] })
    playCode(sim, a!, 'r9')
    expect(sim.view(c!).exposed).toBe(a)
    expect(sim.act(a!, { type: 'catch', targetId: a! })).toEqual({ ok: false, error: "You can't catch yourself" })
    act(sim, c!, { type: 'catch', targetId: a! })
    expect(sim.state.hands[a!]).toEqual(cards('g6', 'b1', 'b2'))
    expect(sim.view(b!).log.at(-1)).toEqual({ kind: 'catch', playerId: c, targetId: a, count: 2 })
    expect(sim.state.turn).toBe(b)
  })

  it('the window closes with the next play', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['r9', 'g6'], ['r1', 'r2'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r9')
    playCode(sim, b!, 'r1')
    expect(sim.act(c!, { type: 'catch', targetId: a! })).toEqual({ ok: false, error: 'Too late: nobody to catch' })
  })

  it('a late call before anyone catches you keeps you safe', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['r9', 'g6'], ['r1'], ['y1']], top: 'r5' })
    expect(sim.act(a!, { type: 'call' })).toEqual({ ok: false, error: 'Nothing to call' })
    playCode(sim, a!, 'r9')
    act(sim, a!, { type: 'call' })
    expect(sim.view(b!).exposed).toBeNull()
    expect(sim.view(b!).log.at(-1)).toEqual({ kind: 'call', playerId: a })
  })

  it('pressing Last card! with more cards left does nothing', () => {
    const sim = newGame()
    const [a] = setTable(sim, { hands: [['r9', 'g6', 'g7'], ['r1'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r9', { lastCard: true })
    expect(sim.state.log.at(-1)).toMatchObject({ called: false })
    expect(sim.state.exposed).toBeNull()
  })

  it('with Automatic, the call is made for you', () => {
    const sim = newGame({ settings: { lastCall: 'auto' } })
    const [a] = setTable(sim, { hands: [['r9', 'g6'], ['r1'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r9')
    expect(sim.state.exposed).toBeNull()
    expect(sim.state.log.at(-1)).toMatchObject({ called: true })
  })
})

describe('the end of a round', () => {
  it('points: the winner scores the cards left in other hands, and every hand is revealed', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['r9'], ['r1', 'W'], ['yS', 'g4']], top: 'r5' })
    playCode(sim, a!, 'r9')
    const v = sim.view(b!)
    expect(v.phase).toBe('RESULTS')
    expect(v.winnerId).toBe(a)
    expect(v.roundPoints).toBe(1 + 50 + 20 + 4)
    expect(v.seats.find((s) => s.id === a)!.points).toBe(75)
    expect(v.champion).toBeNull()
    expect(v.hands![c!]).toEqual(cards('yS', 'g4'))
    expect(v.scores[a!]).toBe(0)
  })

  it('a last draw card still makes the next player draw, for points', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['r+2'], ['r1'], ['y1']], top: 'r5', pile: ['b9', 'b8'] })
    playCode(sim, a!, 'r+2')
    expect(sim.state.hands[b!]).toEqual(cards('r1', 'b9', 'b8'))
    expect(sim.state.roundPoints).toBe(1 + 9 + 8 + 1)
  })

  it('reaching the target wins the game and a point; the next game starts from 0', () => {
    const sim = newGame({ settings: { target: 100 } })
    const [a] = setTable(sim, { hands: [['r9'], ['W', 'W'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r9')
    expect(sim.state.champion).toBe(a)
    expect(sim.state.scores[a!]).toBe(1)
    const guest = PLAYERS.find((id) => id !== sim.hostId)!
    expect(sim.act(guest, { type: 'next_round' })).toEqual({ ok: false, error: 'Only the host can start the next round' })
    act(sim, sim.hostId, { type: 'next_round' })
    expect(sim.state.game).toBe(2)
    expect(sim.state.points).toEqual({ p1: 0, p2: 0, p3: 0 })
    expect(sim.state.scores[a!]).toBe(1)
  })

  it('points carry into the next round of the same game; seats stay and the first turn moves on', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['r9'], ['r1'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r9')
    act(sim, sim.hostId, { type: 'next_round' })
    expect(sim.state.phase).toBe('PLAYING')
    expect(sim.state.round).toBe(2)
    expect(sim.state.game).toBe(1)
    expect(sim.state.points[a!]).toBe(2)
    expect(sim.state.seats).toEqual([b, c, a])
    expect(sim.state.log).toEqual([])
  })

  it('rounds scoring: each round won is a point', () => {
    const sim = newGame({ settings: { scoring: 'rounds' } })
    const [a] = setTable(sim, { hands: [['r9'], ['r1'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r9')
    expect(sim.state.champion).toBe(a)
    expect(sim.state.scores[a!]).toBe(1)
    act(sim, sim.hostId, { type: 'next_round' })
    expect(sim.state.game).toBe(2)
  })

  it('a 7 or 0 as your last card wins without a swap', () => {
    const sim = newGame({ settings: { sevenZero: true } })
    const [a] = setTable(sim, { hands: [['r7'], ['r1'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r7')
    expect(sim.state.winnerId).toBe(a)
  })

  it('seats late joiners at the next round', () => {
    const sim = newGame()
    sim.join({ id: 'late' })
    expect(sim.view('late').you).toEqual({ status: 'waiting', hand: [], drawn: null })
    expect(sim.act('late', { type: 'catch', targetId: 'p1' })).toEqual({ ok: false, error: "You're not in this round" })
    const [a] = setTable(sim, { hands: [['r9'], ['r1'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r9')
    act(sim, sim.hostId, { type: 'next_round' })
    expect(sim.state.hands.late).toHaveLength(7)
  })
})

describe('disconnects and leavers', () => {
  it("a disconnected player's turn draws a card for them after the grace, then passes", () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['r9', 'g6'], ['r1'], ['y1']], top: 'r5', pile: ['r3'] })
    sim.disconnect(a!)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.turn).toBe(b)
    expect(sim.state.hands[a!]).toEqual(cards('r9', 'g6', 'r3'))
    expect(sim.view(b!).log.at(-1)).toEqual({ kind: 'draw', playerId: a, count: 1, penalty: false, away: true })
  })

  it('keeps a drawn card, or takes a stack, for a disconnected player', () => {
    const sim = newGame({ settings: { stacking: true } })
    const [a, b, c] = setTable(sim, { hands: [['r+2', 'g6'], ['r1'], ['y1']], top: 'r5', pile: ['b1', 'b2', 'b3'] })
    playCode(sim, a!, 'r+2')
    sim.disconnect(b!)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.hands[b!]).toHaveLength(3)
    expect(sim.state.turn).toBe(c)
    act(sim, c!, { type: 'draw' })
    sim.disconnect(c!)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.turn).toBe(a)
    expect(sim.state.hands[c!]).toHaveLength(2)
  })

  it('a reconnect in time keeps the turn', () => {
    const sim = newGame()
    const [a] = setTable(sim, { hands: [['r9', 'g6'], ['r1'], ['y1']], top: 'r5' })
    sim.disconnect(a!)
    sim.advance(DISCONNECT_GRACE_MS - 1)
    sim.reconnect(a!)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.turn).toBe(a)
  })

  it("a leaver's hand goes into the draw pile, their seat is skipped, and a stack on them is dropped", () => {
    const sim = newGame({ settings: { stacking: true } })
    const [a, b, c] = setTable(sim, { hands: [['r+2', 'g6'], ['r1', 'r2'], ['r3']], top: 'r5', pile: ['b1'] })
    playCode(sim, a!, 'r+2')
    sim.remove(b!)
    expect(sim.state.drawPile).toHaveLength(3)
    expect(sim.state.turn).toBe(c)
    expect(sim.state.pendingDraw).toBe(0)
    expect(sim.view(c!).seats.find((s) => s.id === b)).toMatchObject({ cards: 0, left: true })
    expect(sim.noticesFor(c!)).toContain('A player left, so their cards went back into the draw pile.')
    playCode(sim, c!, 'r3')
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.state.winnerId).toBe(c)
  })

  it('ends the round with no points when fewer than 2 players are left', () => {
    const sim = newGame({ players: ['p1', 'p2'] })
    const [a, b] = setTable(sim, { hands: [['r9'], ['r1']], top: 'r5' })
    sim.remove(b!)
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view(a!).outcome).toBe('abandoned')
    expect(sim.view(a!).hands).toBeNull()
    expect(sim.state.scores).toEqual({ [a!]: 0 })
  })
})

/** Eight blue cards for a draw pile. */
function cards8(): string[] {
  return ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']
}
