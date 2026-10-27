import { assertValidGame } from '@ogn/core/contract'
import { describe, expect, it } from 'vitest'
import { DEFAULT_QUESTION_LIST } from '../server/default-questions.ts'
import { ballpark, oddsAt } from '../server/game.ts'
import { TOO_HIGH } from '../shared/index.ts'
import { act, betAll, both, guessAll, newGame, PLAYERS, QUESTION, slotOf } from './helpers.ts'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(ballpark)).not.toThrow()
  })
})

describe('guessing', () => {
  it('shows the question with its unit, and only your own guess', () => {
    const sim = newGame()
    act(sim, 'p1', { type: 'submit_guess', value: 300 })
    const mine = sim.view('p1')
    expect(mine.phase).toBe('GUESSING')
    expect(mine.question).toEqual({ text: 'How tall is the Eiffel Tower?', category: 'Landmarks', unit: 'metres' })
    expect(mine.you).toEqual({ status: 'playing', guess: 300, bets: [] })
    expect(mine.totalRounds).toBe(7)
    expect(sim.view('p2').you.guess).toBeNull()
    expect(sim.view('p2').guessed).toEqual(['p1'])
    expect(sim.view('p2').slots).toEqual([])
    expect(sim.view('p2').result).toBeNull()
  })

  it('lets players change their guess until the reveal', () => {
    const sim = newGame()
    act(sim, 'p1', { type: 'submit_guess', value: 300 })
    act(sim, 'p1', { type: 'submit_guess', value: -2.5 })
    expect(sim.view('p1').you.guess).toBe(-2.5)
  })

  it('rejects huge guesses and guesses from late joiners', () => {
    const sim = newGame()
    expect(sim.act('p1', { type: 'submit_guess', value: 2e12 })).toEqual({ ok: false, error: 'That number is too big' })
    sim.join({ id: 'p9' })
    expect(sim.view('p9').you.status).toBe('waiting')
    expect(sim.act('p9', { type: 'submit_guess', value: 1 })).toEqual({ ok: false, error: 'You are not in this round' })
  })

  it('opens betting once everyone has guessed, with equal guesses sharing a slot', () => {
    const sim = newGame()
    guessAll(sim, { p1: 300, p2: 400, p3: 100 })
    expect(sim.state.phase).toBe('GUESSING')
    act(sim, 'p4', { type: 'submit_guess', value: 300 })
    const v = sim.view('p2')
    expect(v.phase).toBe('BETTING')
    expect(v.slots).toEqual([
      { id: TOO_HIGH, value: null, playerIds: [], odds: 6 },
      { id: 'g0', value: 100, playerIds: ['p3'], odds: 3 },
      { id: 'g1', value: 300, playerIds: ['p1', 'p4'], odds: 2 },
      { id: 'g2', value: 400, playerIds: ['p2'], odds: 3 },
    ])
  })

  it('lets the host reveal early; others cannot', () => {
    const sim = newGame()
    act(sim, 'p2', { type: 'submit_guess', value: 5 })
    expect(sim.act('p2', { type: 'reveal_guesses' })).toEqual({ ok: false, error: 'Only the host can reveal the guesses' })
    act(sim, 'p1', { type: 'reveal_guesses' })
    expect(sim.state.phase).toBe('BETTING')
  })

  it('goes straight to the answer when nobody guessed', () => {
    const sim = newGame()
    act(sim, 'p1', { type: 'reveal_guesses' })
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view('p2').result).toMatchObject({ answer: 330, winningSlotIds: [], pointsAwarded: { p1: 0, p2: 0, p3: 0, p4: 0 } })
  })

  it('times out guessing, then betting', () => {
    const sim = newGame({ settings: { timerSeconds: 30 } })
    expect(sim.view('p1').deadline).toBe(1_000_000 + 30_000)
    act(sim, 'p1', { type: 'submit_guess', value: 300 })
    sim.advance(30_000)
    expect(sim.state.phase).toBe('BETTING')
    expect(sim.view('p1').deadline).toBe(1_000_000 + 60_000)
    sim.advance(30_000)
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view('p1').deadline).toBeNull()
  })

  it('does not wait for a disconnected player who has not guessed', () => {
    const sim = newGame()
    guessAll(sim, { p1: 1, p2: 2, p3: 3 })
    sim.disconnect('p4')
    expect(sim.state.phase).toBe('BETTING')
  })
})

describe('odds', () => {
  it('pays 2 in the middle, 1 more each step out, up to 5; 3 for both central slots when even', () => {
    const row = (n: number) => Array.from({ length: n }, (_, i) => oddsAt(i, n))
    expect(row(1)).toEqual([2])
    expect(row(2)).toEqual([3, 3])
    expect(row(4)).toEqual([4, 3, 3, 4])
    expect(row(5)).toEqual([4, 3, 2, 3, 4])
    expect(row(9)).toEqual([5, 5, 4, 3, 2, 3, 4, 5, 5])
  })

  it('has no All too high slot under the closest rule, and flat odds of 1', () => {
    const closest = newGame({ settings: { winRule: 'closest' } })
    guessAll(closest, { p1: 1, p2: 2, p3: 3, p4: 4 })
    expect(closest.state.slots.map((s) => s.id)).toEqual(['g0', 'g1', 'g2', 'g3'])

    const flat = newGame({ settings: { scoring: 'flat' } })
    guessAll(flat, { p1: 1, p2: 2, p3: 3, p4: 4 })
    expect(flat.state.slots.map((s) => s.odds)).toEqual([1, 1, 1, 1, 1])
  })
})

describe('betting', () => {
  function betting(settings = {}) {
    const sim = newGame({ settings })
    guessAll(sim, { p1: 300, p2: 400, p3: 100, p4: 300 })
    return sim
  }

  it('rejects unknown slots and stakes outside chips scoring', () => {
    const sim = betting()
    expect(sim.act('p1', { type: 'place_bets', bets: both('g9') })).toEqual({ ok: false, error: 'That guess is not on the board' })
    expect(sim.act('p1', { type: 'place_bets', bets: both('g1', 1) })).toEqual({
      ok: false,
      error: 'Stakes are only used with chips scoring',
    })
  })

  it('hides other players\' bets until the answer, unless bets are public', () => {
    const hidden = betting()
    act(hidden, 'p1', { type: 'place_bets', bets: both('g1') })
    expect(hidden.view('p1').you.bets).toEqual(both('g1'))
    expect(hidden.view('p2').bets).toBeNull()
    expect(hidden.view('p2').betted).toEqual(['p1'])

    const open = betting({ bets: 'public' })
    act(open, 'p1', { type: 'place_bets', bets: both('g1') })
    expect(open.view('p2').bets).toEqual({ p1: both('g1') })
  })

  it('lets players move their tokens until the reveal', () => {
    const sim = betting()
    act(sim, 'p1', { type: 'place_bets', bets: both('g1') })
    act(sim, 'p1', { type: 'place_bets', bets: [{ slot: 'g0', stake: 0 }, { slot: TOO_HIGH, stake: 0 }] })
    expect(sim.view('p1').you.bets.map((b) => b.slot)).toEqual(['g0', TOO_HIGH])
  })

  it('reveals the answer once everyone has bet, or when the host says so', () => {
    const sim = betting()
    betAll(sim, { p1: both('g1'), p2: both('g1'), p3: both('g1') })
    expect(sim.state.phase).toBe('BETTING')
    expect(sim.act('p2', { type: 'reveal_answer' })).toEqual({ ok: false, error: 'Only the host can reveal the answer' })
    act(sim, 'p1', { type: 'reveal_answer' })
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view('p4').bets).toEqual({ p1: both('g1'), p2: both('g1'), p3: both('g1') })
  })
})

describe('scoring', () => {
  it('without going over: the highest guess not above the answer wins, at its odds, plus 3 for writing it', () => {
    const sim = newGame()
    guessAll(sim, { p1: 300, p2: 400, p3: 100, p4: 300 })
    betAll(sim, {
      p1: both('g1'),
      p2: [{ slot: 'g2', stake: 0 }, { slot: 'g0', stake: 0 }],
      p3: [{ slot: TOO_HIGH, stake: 0 }, { slot: 'g1', stake: 0 }],
      p4: both(TOO_HIGH),
    })
    const result = sim.view('p1').result!
    expect(result).toMatchObject({ answer: 330, fact: 'Including the antennas on top', winningSlotIds: ['g1'] })
    expect(result.pointsAwarded).toEqual({ p1: 2 * 2 + 3, p2: 0, p3: 2, p4: 3 })
    expect(sim.view('p1').scores).toEqual({ p1: 7, p2: 0, p3: 2, p4: 3 })
  })

  it('All too high wins when every guess is over', () => {
    const sim = newGame()
    guessAll(sim, { p1: 400, p2: 500, p3: 600, p4: 700 })
    betAll(sim, { p1: both(TOO_HIGH), p2: both('g0'), p3: both('g0'), p4: both('g0') })
    expect(sim.view('p1').result).toMatchObject({ winningSlotIds: [TOO_HIGH], pointsAwarded: { p1: 12, p2: 0, p3: 0, p4: 0 } })
  })

  it('closest: equally near guesses either side both win', () => {
    const sim = newGame({ settings: { winRule: 'closest' } })
    guessAll(sim, { p1: 320, p2: 340, p3: 100, p4: 500 })
    betAll(sim, { p1: both(slotOf(sim, 340)), p2: both(slotOf(sim, 100)), p3: both(slotOf(sim, 500)), p4: both(slotOf(sim, 320)) })
    const result = sim.view('p1').result!
    expect(result.winningSlotIds).toEqual([slotOf(sim, 320), slotOf(sim, 340)])
    // 4 slots: odds 4 3 3 4
    expect(result.pointsAwarded).toEqual({ p1: 3 * 2 + 3, p2: 3, p3: 0, p4: 3 * 2 })
  })

  it('flat: 1 point a winning token, 1 for writing the winning guess', () => {
    const sim = newGame({ settings: { scoring: 'flat' } })
    guessAll(sim, { p1: 300, p2: 400, p3: 100, p4: 200 })
    betAll(sim, { p1: both('g2'), p2: both('g3'), p3: both('g0'), p4: [{ slot: 'g2', stake: 0 }, { slot: 'g1', stake: 0 }] })
    expect(sim.view('p1').result!.pointsAwarded).toEqual({ p1: 2 + 1, p2: 0, p3: 0, p4: 1 })
  })

  it('chips: stakes multiply a winning token and are lost on a losing one, within your score', () => {
    const sim = newGame({ settings: { scoring: 'chips' } })
    // round 1: p1 earns 7 chips, p2 none
    guessAll(sim, { p1: 300, p2: 400, p3: 100, p4: 300 })
    betAll(sim, { p1: both('g1'), p2: both('g2'), p3: both('g2'), p4: both('g2') })
    expect(sim.state.scores).toEqual({ p1: 7, p2: 0, p3: 0, p4: 3 })

    act(sim, 'p1', { type: 'next_round' })
    guessAll(sim, { p1: 300, p2: 400, p3: 100, p4: 200 })
    expect(sim.act('p1', { type: 'place_bets', bets: [{ slot: 'g2', stake: 5 }, { slot: 'g3', stake: 3 }] })).toEqual({
      ok: false,
      error: 'You only have 7 chips to stake',
    })
    expect(sim.act('p2', { type: 'place_bets', bets: both('g2', 1) })).toEqual({ ok: false, error: 'You only have 0 chips to stake' })
    // 4 guesses: odds 4 3 3 4 on g0-g3; 300 (g2) wins
    betAll(sim, {
      p1: [{ slot: 'g2', stake: 5 }, { slot: 'g3', stake: 2 }],
      p2: both('g2'),
      p3: both('g0'),
      p4: [{ slot: 'g1', stake: 3 }, { slot: 'g2', stake: 0 }],
    })
    expect(sim.view('p1').result!.pointsAwarded).toEqual({ p1: 3 * 6 - 2 + 3, p2: 6, p3: 0, p4: -3 + 3 })
    expect(sim.state.scores).toEqual({ p1: 26, p2: 6, p3: 0, p4: 3 })
  })
})

describe('units', () => {
  it('converts the answer and unit for an imperial room, and scores on the rounded answer', () => {
    // 330 m is 1082.68 ft, played as 1083
    const sim = newGame({ settings: { units: 'imperial' } })
    expect(sim.view('p1').question.unit).toBe('feet')
    guessAll(sim, { p1: 1083, p2: 1084, p3: 1000, p4: 2000 })
    betAll(sim, { p1: both('g1'), p2: both('g1'), p3: both('g1'), p4: both('g1') })
    expect(sim.view('p1').result).toMatchObject({ answer: 1083, winningSlotIds: ['g1'] })
  })
})

describe('rounds', () => {
  function playRound(sim: ReturnType<typeof newGame>) {
    guessAll(sim, { p1: 300, p2: 400, p3: 100, p4: 200 })
    betAll(sim, { p1: both('g3'), p2: both('g3'), p3: both('g0'), p4: both('g0') })
  }

  it('ends after the last round with the top scorers, then starts over on new_game', () => {
    const sim = newGame({ settings: { rounds: 2 } })
    playRound(sim)
    expect(sim.view('p1').result!.winnerIds).toEqual([])
    expect(sim.act('p1', { type: 'new_game' })).toEqual({ ok: false, error: 'The game is not over yet' })
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.view('p1').round).toBe(2)
    playRound(sim)
    expect(sim.view('p1').result!.winnerIds).toEqual(['p1'])
    expect(sim.act('p1', { type: 'next_round' })).toEqual({ ok: false, error: 'The game is over: start a new game' })
    act(sim, 'p1', { type: 'new_game' })
    expect(sim.view('p1')).toMatchObject({ round: 1, phase: 'GUESSING', scores: { p1: 0, p2: 0, p3: 0, p4: 0 } })
  })

  it('plays on without end when rounds are unlimited', () => {
    const sim = newGame({ settings: { rounds: null } })
    playRound(sim)
    expect(sim.view('p1').result!.winnerIds).toEqual([])
    expect(sim.view('p1').totalRounds).toBeNull()
  })

  it('late joiners wait, then play from the next round', () => {
    const sim = newGame()
    sim.join({ id: 'p5' })
    playRound(sim)
    expect(sim.view('p5').you.status).toBe('waiting')
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.view('p5').you.status).toBe('playing')
    expect(sim.view('p5').scores.p5).toBe(0)
  })
})

describe('leaving', () => {
  it('drops a guess while guessing', () => {
    const sim = newGame()
    guessAll(sim, { p1: 1, p2: 2, p3: 3 })
    sim.remove('p3')
    expect(sim.state.phase).toBe('GUESSING')
    act(sim, 'p4', { type: 'submit_guess', value: 4 })
    expect(sim.state.slots.map((s) => s.value)).toEqual([null, 1, 2, 4])
  })

  it('keeps their slot on the board while betting, dropping their bets', () => {
    const sim = newGame()
    guessAll(sim, { p1: 300, p2: 400, p3: 100, p4: 200 })
    act(sim, 'p3', { type: 'place_bets', bets: both('g0') })
    sim.remove('p3')
    expect(sim.state.slots.find((s) => s.value === 100)!.playerIds).toEqual(['p3'])
    betAll(sim, { p1: both('g0'), p2: both('g0'), p4: both('g0') })
    expect(sim.state.phase).toBe('RESULTS')
    // 300 wins: p1 wrote it; everyone bet on 100
    expect(sim.view('p1').result!.pointsAwarded).toEqual({ p1: 3, p2: 0, p4: 0 })
  })
})

describe('questions', () => {
  it('uses starter questions with ctx.rng when prepareRound gives none, with the host notice', () => {
    const sim = newGame({ prepare: { builtin: true, notice: 'The question library is empty, so starter questions are used.' } })
    const texts = DEFAULT_QUESTION_LIST.map((q) => q.question)
    expect(texts).toContain(sim.view('p1').question.text)
    expect(sim.noticesFor('p1')).toEqual(['The question library is empty, so starter questions are used.'])
  })

  it('stays in the chosen category of starter questions', () => {
    const sim = newGame({ prepare: null, settings: { category: 'Space' } })
    expect(sim.view('p1').question.category).toBe('Space')
  })

  it('tracks used library questions for prepareRound', () => {
    const sim = newGame()
    expect(sim.state.usedQuestionIds).toEqual([(QUESTION as { id: number }).id])
    expect(sim.view('p2').roundPlayers).toEqual(PLAYERS)
  })
})
