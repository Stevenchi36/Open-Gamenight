import { assertValidGame } from '@wsfg/core/contract'
import { describe, expect, it } from 'vitest'
import { imposter } from '../server/game.ts'
import { DISCONNECT_GRACE_MS, REVEAL_MS } from '../shared/index.ts'
import {
  catchImposter,
  crewOf,
  current,
  frameCrew,
  newGame,
  PLAYERS,
  playClues,
  playSpoken,
  type Sim,
  voteAll,
  WORD,
} from './helpers.ts'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(imposter)).not.toThrow()
  })
})

describe('roles and words', () => {
  it('gives every crew member the word and the imposter only the category', () => {
    const sim = newGame()
    const imp = sim.state.imposterId
    for (const id of PLAYERS) {
      const you = sim.view(id).you
      if (id === imp) expect(you).toEqual({ role: 'imposter', word: null, category: 'Animals', hint: null, vote: null })
      else expect(you).toEqual({ role: 'crew', word: 'Penguin', category: 'Animals', hint: null, vote: null })
    }
  })

  it.each([
    ['none', null, null],
    ['category', 'Animals', null],
    ['category+hint', 'Animals', 'Dressed for dinner'],
  ] as const)('imposterHint %s', (imposterHint, category, hint) => {
    const sim = newGame({ settings: { imposterHint } })
    expect(sim.view(sim.state.imposterId).you).toMatchObject({ category, hint })
  })

  it('picks the imposter uniformly at random each round (repeats allowed)', () => {
    const counts: Record<string, number> = {}
    for (let seed = 1; seed <= 400; seed++) {
      const id = newGame({ seed }).state.imposterId
      counts[id] = (counts[id] ?? 0) + 1
    }
    for (const id of PLAYERS) expect(counts[id]).toBeGreaterThan(70)
  })

  it('uses built-in words without prepareRound, honoring the category and avoiding repeats', () => {
    const sim = newGame({ prepare: null, settings: { category: 'Toys', guessMode: 'off' } })
    const seen = new Set<string>()
    for (let round = 0; round < 15; round++) {
      expect(sim.state.secret.category).toBe('Toys')
      seen.add(sim.state.secret.word)
      playClues(sim)
      catchImposter(sim)
      sim.advance(REVEAL_MS)
      expect(sim.act('p1', { type: 'next_round' })).toEqual({ ok: true })
    }
    expect(seen.size).toBe(15)
  })

  it('sends a prepared notice to the host only', () => {
    const sim = newGame({ prepare: { ...WORD, notice: 'Library was empty, used built-in words' } })
    expect(sim.noticesFor('p1')).toEqual(['Library was empty, used built-in words'])
    expect(sim.noticesFor('p2')).toEqual([])
  })
})

describe('typed clues', () => {
  it('only the current player may submit, and turns advance through every rotation', () => {
    const sim = newGame()
    const order = sim.state.turnOrder
    const other = order[1]!
    expect(current(sim)).toBe(order[0])
    expect(sim.act(other, { type: 'submit_clue', word: 'cold' })).toEqual({ ok: false, error: "It's not your turn" })
    playClues(sim)
    expect(sim.state.phase).toBe('VOTING')
    expect(sim.state.clues).toHaveLength(order.length * 2)
    expect(sim.state.clues.map((c) => c.rotation)).toEqual([1, 1, 1, 1, 2, 2, 2, 2])
    expect(sim.state.clues.map((c) => c.playerId)).toEqual([...order, ...order])
  })

  it('shows clues to everyone as they arrive', () => {
    const sim = newGame()
    sim.act(current(sim)!, { type: 'submit_clue', word: 'icy' })
    for (const id of PLAYERS) expect(sim.view(id).clues.map((c) => c.word)).toEqual(['icy'])
  })

  it.each([
    ['', 'Enter a clue'],
    ['two words', 'One word only'],
    ['x'.repeat(25), 'At most 24 characters'],
  ])('rejects badly formatted clue %j', (word, error) => {
    const sim = newGame()
    expect(sim.act(current(sim)!, { type: 'submit_clue', word })).toEqual({ ok: false, error })
  })

  it('rejects the secret word from crew (case-insensitive) and repeats from anyone', () => {
    const sim = newGame({ imposter: 'p1' })
    while (current(sim) === 'p1') sim.act('p1', { type: 'submit_clue', word: 'first' })
    const crew = current(sim)!
    expect(sim.act(crew, { type: 'submit_clue', word: ' pEnGuIn ' })).toEqual({
      ok: false,
      error: "You can't use the secret word",
    })
    if (sim.state.clues.length > 0) {
      expect(sim.act(crew, { type: 'submit_clue', word: 'FIRST' })).toEqual({
        ok: false,
        error: 'That clue was already given',
      })
    }
  })

  it("accepts the imposter's clue even if it is the secret word (no probing)", () => {
    const sim = newGame({ imposter: 'p2' })
    while (current(sim) !== 'p2') sim.act(current(sim)!, { type: 'submit_clue', word: `c${sim.state.turnIndex}` })
    expect(sim.act('p2', { type: 'submit_clue', word: 'penguin' })).toEqual({ ok: true })
  })

  it('auto-skips on clue timer expiry and exposes the deadline', () => {
    const sim = newGame({ settings: { clueTimerSeconds: 30 } })
    const first = current(sim)
    expect(sim.view('p1').turn.deadline).toBe(1_000_000 + 30_000)
    sim.advance(29_999)
    expect(current(sim)).toBe(first)
    sim.advance(1)
    expect(current(sim)).toBe(sim.state.turnOrder[1])
    expect(sim.view('p1').turn.deadline).toBe(1_000_000 + 60_000)
    expect(sim.state.clues).toEqual([])
  })

  it('skips a disconnected player after the grace period, unless they come back', () => {
    const sim = newGame()
    const [first, second] = sim.state.turnOrder
    sim.disconnect(first!)
    sim.advance(DISCONNECT_GRACE_MS - 1)
    expect(current(sim)).toBe(first)
    sim.reconnect(first!)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(current(sim)).toBe(first)
    sim.disconnect(first!)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(current(sim)).toBe(second)
  })

  it('schedules the skip right away when the next player is already disconnected', () => {
    const sim = newGame()
    const [first, second, third] = sim.state.turnOrder
    sim.disconnect(second!)
    sim.act(first!, { type: 'submit_clue', word: 'one' })
    expect(current(sim)).toBe(second)
    sim.advance(DISCONNECT_GRACE_MS)
    expect(current(sim)).toBe(third)
  })

  it('lets only the host start voting early', () => {
    const sim = newGame()
    expect(sim.act('p2', { type: 'start_voting' })).toMatchObject({ ok: false })
    expect(sim.act('p1', { type: 'start_voting' })).toEqual({ ok: true })
    expect(sim.state.phase).toBe('VOTING')
  })
})

describe('spoken clues', () => {
  it('rejects typed clues, hides the clue feed, and advances on Done', () => {
    const sim = newGame({ settings: { clueMode: 'spoken' } })
    const [first, second] = sim.state.turnOrder
    expect(sim.act(first!, { type: 'submit_clue', word: 'icy' })).toEqual({
      ok: false,
      error: 'Clues are spoken out loud in this game',
    })
    const notHost = sim.state.turnOrder.find((id) => id !== first && id !== 'p1')!
    expect(sim.act(notHost, { type: 'end_turn' })).toEqual({ ok: false, error: "It's not your turn" })
    expect(sim.act(first!, { type: 'end_turn' })).toEqual({ ok: true })
    expect(current(sim)).toBe(second)
    expect(sim.view('p1').clues).toEqual([])
  })

  it('lets the host tap Done for anyone', () => {
    const sim = newGame({ settings: { clueMode: 'spoken' } })
    const nonHostTurn = sim.state.turnOrder.findIndex((id) => id !== 'p1')
    while (sim.state.turnIndex < nonHostTurn) sim.act(current(sim)!, { type: 'end_turn' })
    expect(sim.act('p1', { type: 'end_turn' })).toEqual({ ok: true })
  })

  it('shows the timer but never auto-advances', () => {
    const sim = newGame({ settings: { clueMode: 'spoken', clueTimerSeconds: 20 } })
    const first = current(sim)
    expect(sim.view('p2').turn.deadline).toBe(1_000_000 + 20_000)
    sim.advance(120_000)
    expect(current(sim)).toBe(first)
  })

  it('rejects end_turn in typed mode', () => {
    const sim = newGame()
    expect(sim.act(current(sim)!, { type: 'end_turn' })).toEqual({ ok: false, error: 'Type your clue instead' })
  })
})

describe('voting', () => {
  it('keeps ballots secret, shows who voted, allows changes and self-vote is rejected', () => {
    const sim = newGame()
    playClues(sim)
    expect(sim.act('p1', { type: 'cast_vote', targetId: 'p1' })).toEqual({
      ok: false,
      error: "You can't vote for yourself",
    })
    sim.act('p1', { type: 'cast_vote', targetId: 'p2' })
    sim.act('p1', { type: 'cast_vote', targetId: 'p3' })
    expect(sim.view('p1').you.vote).toBe('p3')
    expect(sim.view('p2').you.vote).toBeNull()
    expect(sim.view('p2').voted).toEqual(['p1'])
  })

  it('advances once every connected player has voted (a disconnected player is not waited for)', () => {
    const sim = newGame()
    playClues(sim)
    sim.disconnect('p4')
    voteAll(sim, (v) => (v === 'p2' ? 'p3' : 'p2'))
    expect(sim.state.phase).toBe('REVEAL')
  })

  it('advances when a disconnect leaves everyone else already voted', () => {
    const sim = newGame()
    playClues(sim)
    for (const id of ['p1', 'p2', 'p3']) sim.act(id, { type: 'cast_vote', targetId: 'p4' })
    expect(sim.state.phase).toBe('VOTING')
    sim.disconnect('p4')
    expect(sim.state.phase).toBe('REVEAL')
  })

  it('lets the host force the end of voting', () => {
    const sim = newGame()
    playClues(sim)
    expect(sim.act('p2', { type: 'end_voting' })).toMatchObject({ ok: false })
    sim.act('p1', { type: 'end_voting' })
    expect(sim.state.phase).toBe('REVEAL')
    expect(sim.state.outcome).toMatchObject({ accusedId: null, caught: false })
  })

  it('treats a tie as an escape', () => {
    const sim = newGame({ imposter: 'p1' })
    playClues(sim)
    // p1 and p2 get two votes each
    sim.act('p1', { type: 'cast_vote', targetId: 'p2' })
    sim.act('p2', { type: 'cast_vote', targetId: 'p1' })
    sim.act('p3', { type: 'cast_vote', targetId: 'p1' })
    sim.act('p4', { type: 'cast_vote', targetId: 'p2' })
    expect(sim.state.outcome).toMatchObject({ votes: { p1: 2, p2: 2 }, accusedId: null, caught: false })
  })

  it('reveals who voted for whom from REVEAL on, and keeps it through RESULTS', () => {
    const sim = newGame({ imposter: 'p1', settings: { guessMode: 'off' } })
    playClues(sim)
    sim.act('p1', { type: 'cast_vote', targetId: 'p2' })
    sim.act('p2', { type: 'cast_vote', targetId: 'p1' })
    sim.act('p3', { type: 'cast_vote', targetId: 'p1' })
    expect(sim.view('p4').result).toBeUndefined()
    sim.act('p4', { type: 'cast_vote', targetId: 'p1' })
    const ballots = { p1: 'p2', p2: 'p1', p3: 'p1', p4: 'p1' }
    expect(sim.view('p4').result?.votedFor).toEqual(ballots)
    sim.advance(REVEAL_MS)
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view('p2').result?.votedFor).toEqual(ballots)
  })

  it('a disconnected imposter stays in the round and can be caught', () => {
    const sim = newGame({ imposter: 'p3' })
    playClues(sim)
    sim.disconnect('p3')
    voteAll(sim, () => 'p3')
    expect(sim.state.outcome).toMatchObject({ accusedId: 'p3', caught: true })
  })
})

describe('reveal and guess check', () => {
  it('shows tallies and the imposter on reveal; the imposter still does not see the word', () => {
    const sim = newGame({ imposter: 'p2' })
    playClues(sim)
    catchImposter(sim)
    const crewView = sim.view('p1')
    expect(crewView.phase).toBe('REVEAL')
    expect(crewView.result).toMatchObject({ imposterId: 'p2', caught: true, secretWord: 'Penguin' })
    expect(sim.view('p2').result?.secretWord).toBeUndefined()
    expect(sim.view('p2').result?.imposterId).toBe('p2')
  })

  it('moves to GUESS_CHECK after the reveal with the host as judge', () => {
    const sim = newGame({ imposter: 'p2' })
    playClues(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS - 1)
    expect(sim.state.phase).toBe('REVEAL')
    sim.advance(1)
    expect(sim.state.phase).toBe('GUESS_CHECK')
    expect(sim.view('p3').result?.judgeId).toBe('p1')
    expect(sim.view('p2').result?.secretWord).toBeUndefined()
  })

  it('uses the first connected crew member as judge when the host is the imposter', () => {
    const sim = newGame({ imposter: 'p1' })
    playClues(sim)
    sim.disconnect('p2')
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    expect(sim.state.outcome?.judgeId).toBe('p3')
  })

  it('reassigns the judge on disconnect, and only the judge may judge', () => {
    const sim = newGame({ imposter: 'p4' })
    playClues(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    sim.act('p4', { type: 'submit_guess', word: 'penguin' })
    expect(sim.act('p2', { type: 'judge_guess', correct: true })).toEqual({
      ok: false,
      error: 'Only the judge can decide',
    })
    sim.disconnect('p1')
    expect(sim.state.outcome?.judgeId).toBe('p2')
    expect(sim.act('p2', { type: 'judge_guess', correct: true })).toEqual({ ok: true })
    expect(sim.state.phase).toBe('RESULTS')
  })

  it('counts a disconnected imposter as missed after the grace period', () => {
    const sim = newGame({ imposter: 'p2' })
    playClues(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    sim.disconnect('p2')
    sim.advance(DISCONNECT_GRACE_MS)
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.state.outcome?.guessCorrect).toBe(false)
  })

  it('cancels the guess timeout if the imposter reconnects', () => {
    const sim = newGame({ imposter: 'p2' })
    playClues(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    sim.disconnect('p2')
    sim.reconnect('p2')
    sim.advance(DISCONNECT_GRACE_MS * 2)
    expect(sim.state.phase).toBe('GUESS_CHECK')
  })

  it('typed: the imposter types one guess, everyone sees it, and the judge rules after it arrives', () => {
    const sim = newGame({ imposter: 'p2' })
    playClues(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    expect(sim.view('p3').result?.guess).toBeNull()
    expect(sim.act('p1', { type: 'judge_guess', correct: true })).toEqual({ ok: false, error: 'Wait for the guess' })
    expect(sim.act('p3', { type: 'submit_guess', word: 'penguin' })).toEqual({ ok: false, error: 'Only the imposter guesses' })
    expect(sim.act('p2', { type: 'submit_guess', word: '   ' })).toMatchObject({ ok: false })
    expect(sim.act('p2', { type: 'submit_guess', word: '  emperor   pengiun ' })).toEqual({ ok: true })
    expect(sim.act('p2', { type: 'submit_guess', word: 'penguin' })).toEqual({ ok: false, error: 'You already guessed' })
    for (const id of PLAYERS) expect(sim.view(id).result?.guess).toBe('emperor pengiun')
    // The imposter still doesn't see the word until the judge rules.
    expect(sim.view('p2').result?.secretWord).toBeUndefined()
    sim.act('p1', { type: 'judge_guess', correct: true })
    expect(sim.view('p2').result).toMatchObject({ guess: 'emperor pengiun', guessCorrect: true, secretWord: 'Penguin' })
  })

  it('typed: a sent guess stands if the imposter then disconnects', () => {
    const sim = newGame({ imposter: 'p2' })
    playClues(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    sim.act('p2', { type: 'submit_guess', word: 'penguin' })
    sim.disconnect('p2')
    sim.advance(DISCONNECT_GRACE_MS * 2)
    expect(sim.state.phase).toBe('GUESS_CHECK')
    sim.act('p1', { type: 'judge_guess', correct: true })
    expect(sim.state.outcome?.guessCorrect).toBe(true)
  })

  it('spoken: guesses are not typed', () => {
    const sim = newGame({ settings: { clueMode: 'spoken' }, imposter: 'p2' })
    playSpoken(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    expect(sim.act('p2', { type: 'submit_guess', word: 'penguin' })).toEqual({ ok: false, error: 'Say your guess out loud' })
    expect(sim.view('p1').result?.guess).toBeNull()
  })

  it('host can skip the guess (counts as missed)', () => {
    const sim = newGame({ imposter: 'p2' })
    playClues(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    expect(sim.act('p3', { type: 'skip_guess' })).toMatchObject({ ok: false })
    sim.act('p1', { type: 'skip_guess' })
    expect(sim.state.outcome).toMatchObject({ guessCorrect: false })
  })
})

describe('scoring', () => {
  type Case = {
    name: string
    settings: Record<string, unknown>
    caught: boolean
    guess: boolean | null
    imposterPoints: number
    crewPoints: number
    imposterWon: boolean
  }
  const cases: Case[] = [
    { name: 'bonus, caught, missed', settings: {}, caught: true, guess: false, imposterPoints: 0, crewPoints: 1, imposterWon: false },
    { name: 'bonus, caught, guessed', settings: {}, caught: true, guess: true, imposterPoints: 1, crewPoints: 1, imposterWon: false },
    { name: 'bonus, escaped, guessed', settings: {}, caught: false, guess: true, imposterPoints: 3, crewPoints: 0, imposterWon: true },
    { name: 'bonus, escaped, missed', settings: {}, caught: false, guess: false, imposterPoints: 2, crewPoints: 0, imposterWon: true },
    { name: 'steal, caught, guessed', settings: { guessMode: 'steal' }, caught: true, guess: true, imposterPoints: 2, crewPoints: 0, imposterWon: true },
    { name: 'steal, caught, missed', settings: { guessMode: 'steal' }, caught: true, guess: false, imposterPoints: 0, crewPoints: 1, imposterWon: false },
    { name: 'steal, escaped (no guess)', settings: { guessMode: 'steal' }, caught: false, guess: null, imposterPoints: 2, crewPoints: 0, imposterWon: true },
    { name: 'off, caught', settings: { guessMode: 'off' }, caught: true, guess: null, imposterPoints: 0, crewPoints: 1, imposterWon: false },
    { name: 'off, escaped', settings: { guessMode: 'off' }, caught: false, guess: null, imposterPoints: 2, crewPoints: 0, imposterWon: true },
    {
      name: 'custom points',
      settings: { catchPoints: 3, escapePoints: 5, guessPoints: 2 },
      caught: false,
      guess: true,
      imposterPoints: 7,
      crewPoints: 0,
      imposterWon: true,
    },
    {
      name: 'custom catch points',
      settings: { catchPoints: 3 },
      caught: true,
      guess: false,
      imposterPoints: 0,
      crewPoints: 3,
      imposterWon: false,
    },
  ]

  it.each(cases)('$name', ({ settings, caught, guess, imposterPoints, crewPoints, imposterWon }) => {
    const sim = newGame({ imposter: 'p3', settings })
    playClues(sim)
    if (caught) catchImposter(sim)
    else frameCrew(sim)
    sim.advance(REVEAL_MS)
    if (guess === null) {
      expect(sim.state.phase).toBe('RESULTS')
    } else {
      expect(sim.state.phase).toBe('GUESS_CHECK')
      expect(sim.act('p3', { type: 'submit_guess', word: 'pengiun' })).toEqual({ ok: true })
      expect(sim.act('p1', { type: 'judge_guess', correct: guess })).toEqual({ ok: true })
    }
    const result = sim.view('p3').result!
    expect(result.imposterWon).toBe(imposterWon)
    expect(result.secretWord).toBe('Penguin')
    expect(result.pointsAwarded?.p3).toBe(imposterPoints)
    for (const id of crewOf(sim)) expect(result.pointsAwarded?.[id]).toBe(crewPoints)
    expect(sim.state.scores.p3).toBe(imposterPoints)
  })
})

describe('rounds and players', () => {
  it('next_round re-rolls, keeps scores, adds new players, and is host only', () => {
    const sim = newGame({ settings: { guessMode: 'off' }, imposter: 'p2' })
    playClues(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    const scores = { ...sim.state.scores }
    sim.join({ id: 'p5' })
    expect(sim.act('p2', { type: 'next_round' })).toMatchObject({ ok: false })
    expect(sim.act('p1', { type: 'next_round' })).toEqual({ ok: true })
    expect(sim.state).toMatchObject({ phase: 'CLUES', round: 2, clues: [], ballots: {}, outcome: null })
    expect(sim.state.roundPlayers).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(sim.state.scores).toEqual({ ...scores, p5: 0 })
    expect(sim.state.usedWordIds).toEqual([7, 7])
  })

  function finishRound(sim: Sim): void {
    playClues(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    expect(sim.act('p1', { type: 'next_round' })).toEqual({ ok: true })
  }

  it('rotate (default): the next player in line goes first each round, in the same order', () => {
    const sim = newGame({ settings: { guessMode: 'off' } })
    const [a, b, c, d] = sim.state.turnOrder
    finishRound(sim)
    expect(sim.state.turnOrder).toEqual([b, c, d, a])
    finishRound(sim)
    expect(sim.state.turnOrder).toEqual([c, d, a, b])
  })

  it('rotate: players who left drop out and newcomers join the end of the line', () => {
    let seed = 1
    while (newGame({ seed }).state.turnOrder[1] === 'p1') seed++
    const sim = newGame({ seed, settings: { guessMode: 'off' } })
    const [a, b, c, d] = sim.state.turnOrder
    playClues(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    // a went first, so b would be next; with b gone it passes to c
    sim.remove(b!)
    sim.join({ id: 'p5' })
    expect(sim.act('p1', { type: 'next_round' })).toEqual({ ok: true })
    expect(sim.state.turnOrder).toEqual([c, d, a, 'p5'])
  })

  it('rotate: the host can reshuffle once on Play again, then it rotates from the new order', () => {
    let reshuffled = false
    for (let seed = 1; seed < 50 && !reshuffled; seed++) {
      const sim = newGame({ seed, settings: { guessMode: 'off' } })
      const [a, b, c, d] = sim.state.turnOrder
      playClues(sim)
      catchImposter(sim)
      sim.advance(REVEAL_MS)
      expect(sim.act('p1', { type: 'next_round', shuffle: true })).toEqual({ ok: true })
      const order = sim.state.turnOrder
      expect([...order].sort()).toEqual([...PLAYERS])
      reshuffled = order.join() !== [b, c, d, a].join()
      finishRound(sim)
      expect(sim.state.turnOrder).toEqual([...order.slice(1), order[0]])
    }
    expect(reshuffled).toBe(true)
  })

  it('random: reshuffles every round', () => {
    const orders = new Set<string>()
    const sim = newGame({ settings: { guessMode: 'off', playerOrder: 'random' } })
    for (let round = 0; round < 10; round++) {
      orders.add(sim.state.turnOrder.join())
      finishRound(sim)
    }
    expect(orders.size).toBeGreaterThan(2)
  })

  it('shows a late joiner a waiting view without the word', () => {
    const sim = newGame()
    sim.join({ id: 'p5' })
    expect(sim.view('p5').you).toEqual({ role: 'waiting', word: null, category: null, hint: null, vote: null })
    playClues(sim)
    expect(sim.act('p5', { type: 'cast_vote', targetId: 'p1' })).toEqual({
      ok: false,
      error: 'You are not in this round',
    })
  })

  it('voids the round if the imposter leaves before the reveal', () => {
    const sim = newGame({ imposter: 'p3' })
    sim.remove('p3')
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view('p1').result).toMatchObject({ voided: true, pointsAwarded: {} })
    expect(sim.noticesFor('p1')).toContain("The imposter left, so this round doesn't count.")
  })

  it('skips a removed player in the turn order and drops their votes', () => {
    const sim = newGame({ imposter: 'p1' })
    const [first, second] = sim.state.turnOrder
    if (first === 'p1') sim.act('p1', { type: 'submit_clue', word: 'x' })
    const victim = current(sim)!
    const next = sim.state.turnOrder[sim.state.turnIndex + 1]
    sim.remove(victim)
    expect(current(sim)).toBe(next ?? second)
    expect(sim.view('p1').turn.order).not.toContain(victim)
  })

  it('completes a full spoken round', () => {
    const sim = newGame({ settings: { clueMode: 'spoken' }, imposter: 'p4' })
    playSpoken(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    sim.act('p1', { type: 'judge_guess', correct: false })
    expect(sim.view('p4').result).toMatchObject({ imposterWon: false, secretWord: 'Penguin' })
  })

  it('ignores stale timers from earlier turns and rounds', () => {
    const sim = newGame({ settings: { clueTimerSeconds: 30 } })
    sim.act(current(sim)!, { type: 'submit_clue', word: 'fast' })
    const at = sim.state.turnIndex
    // the first turn's timer was cancelled/replaced; nothing should fire early
    sim.advance(29_000)
    expect(sim.state.turnIndex).toBe(at)
  })

  it('rejects system actions from players', () => {
    const sim = newGame()
    expect(sim.act('p1', { type: 'reveal_done', round: 1 })).toMatchObject({ ok: false })
  })
})
