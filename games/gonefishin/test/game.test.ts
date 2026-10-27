import { assertValidGame } from '@ogn/core/contract'
import { DISCONNECT_GRACE_MS, RANKS } from '@ogn/core/kit'
import { describe, expect, it } from 'vitest'
import { goneFishin } from '../server/game.ts'
import { act, booksExcept, cards, newGame, PLAYERS, setTable } from './helpers.ts'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(goneFishin)).not.toThrow()
  })
})

describe('the deal', () => {
  it('deals 7 cards each to 3 players and shows each player only their own hand', () => {
    const sim = newGame()
    const booked = Object.values(sim.state.books).flat().length
    for (const id of PLAYERS) {
      const v = sim.view(id)
      expect(v.you.status).toBe('playing')
      expect(v.you.hand).toHaveLength(sim.state.hands[id]!.length)
      expect(v.you.hand.map((c) => c.rank + c.suit).sort()).toEqual(sim.state.hands[id]!.map((c) => c.rank + c.suit).sort())
      expect(v.seats.map((s) => s.id)).toEqual(sim.state.seats)
    }
    expect(sim.view('p1').pond).toBe(52 - 21)
    expect(Object.values(sim.state.hands).flat().length + booked * 4).toBe(21)
    expect(sim.state.turn).toBe(sim.state.seats[0])
  })

  it('deals 5 cards each to 4 or more players', () => {
    const sim = newGame({ players: ['p1', 'p2', 'p3', 'p4'] })
    expect(sim.state.pond).toHaveLength(52 - 20)
  })

  it('lays down books dealt in the opening hand', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const sim = newGame({ players: ['p1', 'p2'], seed })
      const total = Object.values(sim.state.hands).flat().length + sim.state.pond.length
      expect(total + Object.values(sim.state.books).flat().length * 4).toBe(52)
      for (const hand of Object.values(sim.state.hands)) {
        for (const rank of RANKS) expect(hand.filter((c) => c.rank === rank).length).toBeLessThan(4)
      }
    }
  })
})

describe('asking', () => {
  it('rejects asks out of turn, for a rank you lack, of yourself, or of a player with no cards', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['7S', '9H'], ['7H'], []], pond: ['2C', '3C'] })
    expect(sim.act(b!, { type: 'ask', targetId: a!, rank: '7' })).toEqual({ ok: false, error: "It's not your turn" })
    expect(sim.act(a!, { type: 'ask', targetId: b!, rank: 'K' })).toEqual({ ok: false, error: 'You can only ask for a rank you hold' })
    expect(sim.act(a!, { type: 'ask', targetId: a!, rank: '7' })).toEqual({ ok: false, error: "You can't ask yourself" })
    expect(sim.act(a!, { type: 'ask', targetId: c!, rank: '7' })).toEqual({ ok: false, error: 'That player has no cards' })
    expect(sim.act(a!, { type: 'ask', targetId: 'nobody', rank: '7' })).toEqual({ ok: false, error: "That player isn't in this game" })
  })

  it('a hit hands over every card of the rank and the asker goes again', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['7S', '9H'], ['7H', '7D', 'KC'], ['2S']], pond: ['2C'] })
    act(sim, a!, { type: 'ask', targetId: b!, rank: '7' })
    expect(sim.state.hands[a!]).toHaveLength(4)
    expect(sim.state.hands[b!]).toEqual(cards('KC'))
    expect(sim.state.turn).toBe(a)
    expect(sim.view(b!).log).toEqual([{ askerId: a, targetId: b, rank: '7', given: 2, drew: false, lucky: false, books: [] }])
  })

  it('a miss draws the top of the pond and passes the turn', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['7S'], ['KC'], ['2S']], pond: ['3C', '4C'] })
    act(sim, a!, { type: 'ask', targetId: b!, rank: '7' })
    expect(sim.state.hands[a!]).toEqual(cards('7S', '3C'))
    expect(sim.state.pond).toEqual(cards('4C'))
    expect(sim.state.turn).toBe(b)
    expect(sim.view(b!).log.at(-1)).toMatchObject({ given: 0, drew: true, lucky: false })
  })

  it('a lucky catch is shown and the asker goes again', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['7S'], ['KC'], ['2S']], pond: ['7C', '4C'] })
    act(sim, a!, { type: 'ask', targetId: b!, rank: '7' })
    expect(sim.state.turn).toBe(a)
    expect(sim.view(b!).log.at(-1)).toMatchObject({ given: 0, drew: true, lucky: true })
  })

  it('without Lucky catch, drawing the asked rank still passes the turn', () => {
    const sim = newGame({ settings: { luckyCatch: false } })
    const [a, b] = setTable(sim, { hands: [['7S'], ['KC'], ['2S']], pond: ['7C', '4C'] })
    act(sim, a!, { type: 'ask', targetId: b!, rank: '7' })
    expect(sim.state.turn).toBe(b)
    expect(sim.view(b!).log.at(-1)).toMatchObject({ drew: true, lucky: false })
  })

  it('a miss with an empty pond just passes the turn', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['7S'], ['KC'], ['2S']] })
    act(sim, a!, { type: 'ask', targetId: b!, rank: '7' })
    expect(sim.state.turn).toBe(b)
    expect(sim.view(b!).log.at(-1)).toMatchObject({ given: 0, drew: false })
  })
})

describe('books and empty hands', () => {
  it('completing four of a kind lays the book down', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['7S', '7H', '9C'], ['7D', '7C'], ['2S']], pond: ['3C'] })
    act(sim, a!, { type: 'ask', targetId: b!, rank: '7' })
    expect(sim.state.books[a!]).toEqual(['7'])
    expect(sim.state.hands[a!]).toEqual(cards('9C'))
    expect(sim.view(b!).seats.find((s) => s.id === a)!.books).toEqual(['7'])
    expect(sim.view(b!).log.at(-1)!.books).toEqual(['7'])
  })

  it('a hand emptied by a book draws one card and the turn carries on', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['7S', '7H'], ['7D', '7C', 'KC'], ['2S']], pond: ['KS', '3C'] })
    act(sim, a!, { type: 'ask', targetId: b!, rank: '7' })
    expect(sim.state.hands[a!]).toEqual(cards('KS'))
    expect(sim.state.turn).toBe(a)
  })

  it('a player with an empty hand and an empty pond is skipped', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['7S'], [], ['2S', 'KH']] })
    act(sim, a!, { type: 'ask', targetId: c!, rank: '7' })
    expect(sim.state.turn).toBe(c)
    expect(sim.state.hands[b!]).toEqual([])
  })

  it('with nobody else holding cards, the player draws instead of asking and the turn passes', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['7S'], ['7H'], []], pond: ['7D', '9C', '9D'] })
    // a takes b's last card; nobody else holds cards, so a draws and passes, and b (empty) draws on their turn.
    act(sim, a!, { type: 'ask', targetId: b!, rank: '7' })
    const log = sim.view(b!).log
    expect(log.at(-1)).toEqual({ askerId: a, targetId: null, rank: null, given: 0, drew: true, lucky: false, books: [] })
    expect(sim.state.hands[a!]).toEqual(cards('7S', '7H', '7D'))
    expect(sim.state.hands[b!]).toEqual(cards('9C'))
    expect(sim.state.turn).toBe(b)
  })
})

describe('the end of a game', () => {
  it('ends when the last book goes down; most books wins a point', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, {
      hands: [['QS', 'QH'], ['QD', 'QC'], []],
      books: [['A', '2', '3', '4', '5'], ['6', '7', '8', '9'], booksExcept('A', '2', '3', '4', '5', '6', '7', '8', '9', 'Q')],
    })
    act(sim, a!, { type: 'ask', targetId: b!, rank: 'Q' })
    expect(sim.state.phase).toBe('RESULTS')
    const v = sim.view(c!)
    expect(v.outcome).toBe('win')
    expect(v.winnerIds).toEqual([a])
    expect(v.turn).toBeNull()
    expect(v.scores).toEqual({ [a!]: 1, [b!]: 0, [c!]: 0 })
  })

  it('tied players each score a point', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, {
      hands: [['QS', 'QH'], ['QD', 'QC'], []],
      books: [['A', '2', '3', '4'], ['5', '6', '7', '8', '9'], ['10', 'J', 'K']],
    })
    act(sim, a!, { type: 'ask', targetId: b!, rank: 'Q' })
    expect(sim.state.winnerIds).toEqual([a, b])
    expect(sim.state.scores).toEqual({ [a!]: 1, [b!]: 1, [c!]: 0 })
  })

  it('the host starts the next game: same seats round the table, first turn moved on one', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['QS', 'QH'], ['QD', 'QC'], []], books: [booksExcept('Q'), [], []] })
    act(sim, a!, { type: 'ask', targetId: b!, rank: 'Q' })
    const guest = [a, b, c].find((id) => id !== sim.hostId)!
    expect(sim.act(guest, { type: 'new_game' })).toEqual({ ok: false, error: 'Only the host can start a new game' })
    act(sim, sim.hostId, { type: 'new_game' })
    expect(sim.state.phase).toBe('PLAYING')
    expect(sim.state.game).toBe(2)
    expect(sim.state.seats).toEqual([b, c, a])
    expect(sim.state.turn).toBe(b)
    expect(sim.state.log).toEqual([])
    expect(sim.state.scores[a!]).toBe(1)
  })

  it('seats late joiners at the next game', () => {
    const sim = newGame()
    sim.join({ id: 'late' })
    expect(sim.view('late').you).toEqual({ status: 'waiting', hand: [] })
    expect(sim.view('late').seats.map((s) => s.id)).not.toContain('late')
    const [a, b] = setTable(sim, { hands: [['QS', 'QH'], ['QD', 'QC'], []], books: [booksExcept('Q'), [], []] })
    act(sim, a!, { type: 'ask', targetId: b!, rank: 'Q' })
    act(sim, sim.hostId, { type: 'new_game' })
    expect(sim.state.seats).toContain('late')
    expect(sim.state.hands.late).toHaveLength(5)
  })
})

describe('disconnects and leavers', () => {
  it("passes a disconnected player's turn after the grace; their hand stays and they can still be asked", () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['7S'], ['7H', 'KC'], ['2S']], pond: ['3C'] })
    sim.disconnect(a!)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.turn).toBe(b)
    act(sim, b!, { type: 'ask', targetId: a!, rank: '7' })
    expect(sim.state.hands[a!]).toEqual([])
  })

  it('a reconnect in time keeps the turn', () => {
    const sim = newGame()
    const [a] = setTable(sim, { hands: [['7S'], ['7H'], ['2S']], pond: ['3C'] })
    sim.disconnect(a!)
    sim.advance(DISCONNECT_GRACE_MS - 1)
    sim.reconnect(a!)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.turn).toBe(a)
  })

  it("a leaver's hand goes into the pond, their books stay, and the turn moves on if it was theirs", () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, { hands: [['7S', '8S'], ['7H'], ['2S']], pond: ['3C'], books: [['K'], [], []] })
    sim.remove(a!)
    expect(sim.state.pond).toHaveLength(3)
    expect(sim.state.turn).toBe(b)
    const seat = sim.view(c!).seats.find((s) => s.id === a)!
    expect(seat).toEqual({ id: a, cards: 0, books: ['K'], left: true })
    expect(sim.noticesFor(b!)).toContain('A player left, so their cards went back into the pond.')
    expect(sim.act(b!, { type: 'ask', targetId: a!, rank: '7' })).toEqual({ ok: false, error: "That player isn't in this game" })
  })

  it('a leaver can\'t win, even with the most books', () => {
    const sim = newGame()
    const [a, b, c] = setTable(sim, {
      hands: [[], ['QS', 'QH'], ['QD', 'QC']],
      books: [booksExcept('Q', 'J'), ['J'], []],
    })
    sim.state = { ...sim.state, turn: b! }
    sim.remove(a!)
    act(sim, b!, { type: 'ask', targetId: c!, rank: 'Q' })
    expect(sim.state.winnerIds).toEqual([b])
  })

  it('ends the game with no points when fewer than 2 players are left', () => {
    const sim = newGame({ players: ['p1', 'p2'] })
    const [a, b] = setTable(sim, { hands: [['7S'], ['7H']], pond: ['3C'] })
    sim.remove(b!)
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view(a!).outcome).toBe('abandoned')
    expect(sim.state.scores).toEqual({ [a!]: 0 })
  })
})
