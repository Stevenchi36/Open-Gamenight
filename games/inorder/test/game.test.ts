import { describe, expect, it } from 'vitest'
import { longestRun } from '../server/game.ts'
import { DEFAULT_THEME_LIST } from '../server/default-themes.ts'
import { act, arrange, clueAll, newGame, PLAYERS, readyAll, sorted } from './helpers.ts'

describe('dealing', () => {
  it('gives every player their numbers, all different, and lines the cards up in seat order', () => {
    const sim = newGame({ settings: { numbersEach: 2 } })
    const cards = Object.values(sim.state.cards)
    expect(cards).toHaveLength(8)
    expect(new Set(cards.map((c) => c.number)).size).toBe(8)
    expect(cards.every((c) => c.number >= 1 && c.number <= 100)).toBe(true)
    expect(sim.state.line).toEqual(['p1#0', 'p1#1', 'p2#0', 'p2#1', 'p3#0', 'p3#1', 'p4#0', 'p4#1'])
    expect(sim.view('p2').you.cards.map((c) => c.id).sort()).toEqual(['p2#0', 'p2#1'])
    expect(sim.view('p1').theme).toEqual({ text: 'How scary is it?', low: 'Not scary at all', high: 'Terrifying', category: 'Everyday Life' })
  })

  it('shows your own numbers lowest first, and no numbers in the line', () => {
    const sim = newGame({ settings: { numbersEach: 3 } })
    const mine = sim.view('p1').you.cards.map((c) => c.number)
    expect(mine).toEqual([...mine].sort((a, b) => a - b))
    expect(sim.view('p1').line.every((c) => c.number === null)).toBe(true)
  })

  it('uses a starter theme with the host notice when the library has none, without repeats', () => {
    const sim = newGame({ prepare: { builtin: true, notice: 'Library empty' } })
    expect(sim.noticesFor('p1')).toEqual(['Library empty'])
    const first = sim.state.theme
    expect(first.id).toBeNull()
    expect(DEFAULT_THEME_LIST.some((t) => t.theme === first.text)).toBe(true)
    clueAll(sim)
    readyAll(sim)
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.state.theme.text).not.toBe(first.text)
    expect(sim.state.usedBuiltin).toHaveLength(2)
  })

  it('records library themes so the room does not repeat them', () => {
    const sim = newGame()
    expect(sim.state.usedThemeIds).toEqual([7])
  })
})

describe('clues', () => {
  it('only the owner can clue a card, and never with their own number', () => {
    const sim = newGame()
    const card = sim.state.cards['p1#0']!
    expect(sim.act('p2', { type: 'submit_clue', itemId: 'p1#0', text: 'a kitten' })).toEqual({ ok: false, error: 'That is not your card' })
    expect(sim.act('p1', { type: 'submit_clue', itemId: 'p1#0', text: `about ${card.number}!` })).toEqual({ ok: false, error: "Don't say your number" })
    expect(sim.act('p1', { type: 'submit_clue', itemId: 'p1#0', text: '   ' })).toEqual({ ok: false, error: 'Enter a clue' })
    act(sim, 'p1', { type: 'submit_clue', itemId: 'p1#0', text: '  a   kitten ' })
    expect(sim.view('p3').line[0]).toEqual({ id: 'p1#0', playerId: 'p1', clue: 'a kitten', number: null })
  })

  it('allows other numbers in a clue', () => {
    const sim = newGame()
    // 101 is never dealt, and the 1 and 10 inside it are not standalone numbers
    act(sim, 'p1', { type: 'submit_clue', itemId: 'p1#0', text: '101 Dalmatians' })
    expect(sim.state.cards['p1#0']!.clue).toBe('101 Dalmatians')
  })

  it('a changed clue clears every Ready; the same clue again does not', () => {
    const sim = newGame()
    clueAll(sim)
    readyAll(sim, ['p2', 'p3'])
    act(sim, 'p1', { type: 'submit_clue', itemId: 'p1#0', text: 'clue p1#0' })
    expect(sim.state.ready).toEqual(['p2', 'p3'])
    act(sim, 'p1', { type: 'submit_clue', itemId: 'p1#0', text: 'a ghost' })
    expect(sim.state.ready).toEqual([])
  })
})

describe('the line', () => {
  it('any round player moves any card; the index is clamped; a move clears every Ready', () => {
    const sim = newGame()
    clueAll(sim)
    readyAll(sim, ['p1', 'p2'])
    act(sim, 'p3', { type: 'move_item', itemId: 'p1#0', to: 99 })
    expect(sim.state.line).toEqual(['p2#0', 'p3#0', 'p4#0', 'p1#0'])
    expect(sim.state.ready).toEqual([])
    act(sim, 'p4', { type: 'move_item', itemId: 'p4#0', to: 0 })
    expect(sim.state.line).toEqual(['p4#0', 'p2#0', 'p3#0', 'p1#0'])
  })

  it('a move to the same place changes nothing', () => {
    const sim = newGame()
    clueAll(sim)
    readyAll(sim, ['p1'])
    act(sim, 'p2', { type: 'move_item', itemId: 'p2#0', to: 1 })
    expect(sim.state.ready).toEqual(['p1'])
  })

  it('late joiners wait: no cards, no moves, no Ready', () => {
    const sim = newGame()
    sim.join({ id: 'p9' })
    expect(sim.view('p9').you).toEqual({ status: 'waiting', cards: [] })
    expect(sim.act('p9', { type: 'move_item', itemId: 'p1#0', to: 2 })).toEqual({ ok: false, error: 'You are not in this round' })
    expect(sim.act('p9', { type: 'set_ready', ready: true })).toEqual({ ok: false, error: 'You are not in this round' })
  })
})

describe('ready and reveal', () => {
  it('Ready needs your own clues; the line is revealed when everyone is ready', () => {
    const sim = newGame()
    expect(sim.act('p1', { type: 'set_ready', ready: true })).toEqual({ ok: false, error: 'Give each of your numbers a clue first' })
    clueAll(sim)
    readyAll(sim, ['p1', 'p2', 'p3'])
    act(sim, 'p2', { type: 'set_ready', ready: false })
    expect(sim.state.ready).toEqual(['p1', 'p3'])
    readyAll(sim, ['p2'])
    expect(sim.state.phase).toBe('ORDERING')
    readyAll(sim, ['p4'])
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view('p2').line.every((c) => c.number !== null)).toBe(true)
  })

  it('a disconnected player does not hold up the reveal, clued or not', () => {
    const sim = newGame()
    clueAll(sim)
    readyAll(sim, ['p1', 'p2', 'p3'])
    sim.disconnect('p4')
    expect(sim.state.phase).toBe('RESULTS')
  })

  it('the host can reveal at any time; nobody else can', () => {
    const sim = newGame()
    expect(sim.act('p2', { type: 'reveal_now' })).toEqual({ ok: false, error: 'Only the host can reveal the line' })
    act(sim, 'p1', { type: 'reveal_now' })
    expect(sim.state.phase).toBe('RESULTS')
  })
})

describe('mistakes and lives', () => {
  it('longestRun finds one longest increasing run', () => {
    expect(longestRun([])).toEqual([])
    expect(longestRun([10, 20, 30])).toEqual([0, 1, 2])
    expect(longestRun([50, 10, 20, 30, 40])).toEqual([1, 2, 3, 4])
    expect(longestRun([40, 30, 20, 10])).toHaveLength(1)
    expect(longestRun([3, 1, 4, 1.5, 5, 9, 2, 6])).toHaveLength(4)
  })

  it('a line in order loses nothing and counts as perfect', () => {
    const sim = newGame()
    clueAll(sim)
    arrange(sim, sorted(sim))
    readyAll(sim)
    expect(sim.view('p1').result).toEqual({ livesLost: 0, wrong: [], outcome: null })
    expect(sim.view('p1')).toMatchObject({ lives: 3, cleared: 1, perfect: 1 })
  })

  it('one card far from home costs one life, not one per card it passes', () => {
    const sim = newGame()
    clueAll(sim)
    const [a, b, c, d] = sorted(sim)
    arrange(sim, [d!, a!, b!, c!])
    readyAll(sim)
    expect(sim.view('p1').result).toEqual({ livesLost: 1, wrong: [d], outcome: null })
    expect(sim.view('p1')).toMatchObject({ lives: 2, cleared: 1, perfect: 0 })
  })

  it('running out of lives loses the game, and lives never go below 0', () => {
    const sim = newGame({ settings: { lives: 2 } })
    clueAll(sim)
    arrange(sim, sorted(sim).reverse())
    readyAll(sim)
    expect(sim.view('p1')).toMatchObject({ lives: 0, cleared: 0, result: { livesLost: 3, outcome: 'lost' } })
    expect(sim.act('p1', { type: 'next_round' })).toEqual({ ok: false, error: 'The game is over: start a new game' })
  })

  it('surviving the last round wins; New game restores lives and starts again from round 1', () => {
    const sim = newGame({ settings: { rounds: 2 } })
    for (const round of [1, 2]) {
      expect(sim.state.round).toBe(round)
      clueAll(sim)
      const [a, b, c, d] = sorted(sim)
      arrange(sim, [b!, a!, c!, d!]) // one mistake per round
      readyAll(sim)
      if (round === 1) {
        expect(sim.view('p1').result!.outcome).toBeNull()
        expect(sim.act('p1', { type: 'new_game' })).toEqual({ ok: false, error: 'The game is not over yet' })
        act(sim, 'p1', { type: 'next_round' })
      }
    }
    expect(sim.view('p1')).toMatchObject({ lives: 1, cleared: 2, result: { outcome: 'won' } })
    act(sim, 'p1', { type: 'new_game' })
    expect(sim.view('p1')).toMatchObject({ phase: 'ORDERING', round: 1, lives: 3, cleared: 0, perfect: 0, result: null })
  })

  it('with unlimited rounds the game goes on until the lives run out', () => {
    const sim = newGame({ settings: { rounds: null, lives: 1 } })
    for (let round = 1; round <= 3; round++) {
      clueAll(sim)
      arrange(sim, sorted(sim))
      readyAll(sim)
      expect(sim.view('p1').result!.outcome).toBeNull()
      act(sim, 'p1', { type: 'next_round' })
    }
    clueAll(sim)
    arrange(sim, sorted(sim).reverse())
    readyAll(sim)
    expect(sim.view('p1')).toMatchObject({ round: 4, totalRounds: null, cleared: 3, perfect: 3, result: { outcome: 'lost' } })
  })

  it('the next round keeps the lives and deals new numbers to everyone present, late joiners included', () => {
    const sim = newGame()
    sim.join({ id: 'p9' })
    clueAll(sim)
    const [a, b, c, d] = sorted(sim)
    arrange(sim, [b!, a!, c!, d!])
    readyAll(sim)
    expect(sim.act('p2', { type: 'next_round' })).toEqual({ ok: false, error: 'Only the host can start the next round' })
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.state).toMatchObject({ round: 2, lives: 2, phase: 'ORDERING' })
    expect(sim.state.roundPlayers).toEqual([...PLAYERS, 'p9'])
    expect(sim.view('p9').you.cards).toHaveLength(1)
  })
})

describe('players leaving', () => {
  it('cards leave the line with their owner, and the rest may then be ready', () => {
    const sim = newGame()
    clueAll(sim)
    readyAll(sim, ['p1', 'p2', 'p3'])
    sim.remove('p4')
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.state.line).toEqual(['p1#0', 'p2#0', 'p3#0'])
  })

  it('cards stay on the results screen when their owner leaves', () => {
    const sim = newGame()
    act(sim, 'p1', { type: 'reveal_now' })
    sim.remove('p2')
    expect(sim.view('p1').line).toHaveLength(4)
  })

  it('a game for two keeps going with the prepared theme', () => {
    const sim = newGame({ players: ['p1', 'p2'] })
    expect(sim.state.theme).toMatchObject({ id: 7 })
    clueAll(sim)
    readyAll(sim)
    expect(sim.state.phase).toBe('RESULTS')
  })
})
