import { assertValidGame } from '@ogn/core/contract'
import { describe, expect, it } from 'vitest'
import { DEFAULT_QUESTION_LIST } from '../server/default-questions.ts'
import { flock } from '../server/game.ts'
import { act, answerAll, groupWith, newGame, PLAYERS } from './helpers.ts'

const QUESTION_TEXT = 'Name a breakfast cereal'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(flock)).not.toThrow()
  })
})

describe('answering', () => {
  it('shows everyone the question and only their own answer', () => {
    const sim = newGame()
    act(sim, 'p1', { type: 'submit_answer', text: '  Cheerios ' })
    const mine = sim.view('p1')
    expect(mine.phase).toBe('ANSWERING')
    expect(mine.question).toEqual({ text: 'Name a breakfast cereal', category: 'Food & Drink' })
    expect(mine.you).toEqual({ status: 'playing', answer: 'Cheerios' })
    expect(sim.view('p2').you.answer).toBeNull()
    expect(sim.view('p2').answered).toEqual(['p1'])
    expect(sim.view('p2').groups).toEqual([])
  })

  it('lets players change their answer until the reveal', () => {
    const sim = newGame()
    act(sim, 'p1', { type: 'submit_answer', text: 'Cheerios' })
    act(sim, 'p1', { type: 'submit_answer', text: 'Shreddies' })
    expect(sim.view('p1').you.answer).toBe('Shreddies')
    expect(sim.view('p1').answered).toEqual(['p1'])
  })

  it('rejects empty answers and answers from late joiners', () => {
    const sim = newGame()
    expect(sim.act('p1', { type: 'submit_answer', text: '   ' })).toEqual({ ok: false, error: 'Enter an answer' })
    sim.join({ id: 'p9' })
    expect(sim.view('p9').you.status).toBe('waiting')
    expect(sim.act('p9', { type: 'submit_answer', text: 'Muesli' })).toEqual({ ok: false, error: 'You are not in this round' })
  })

  it('reveals once everyone has answered, grouping matching answers', () => {
    const sim = newGame()
    answerAll(sim, { p1: 'Cheerios', p2: 'cheerios!', p3: 'Shreddies' })
    expect(sim.state.phase).toBe('ANSWERING')
    act(sim, 'p4', { type: 'submit_answer', text: 'Corn Flakes' })
    const v = sim.view('p3')
    expect(v.phase).toBe('REVIEW')
    expect(v.groups.map((g) => [g.label, g.answers.map((a) => a.playerId)])).toEqual([
      ['Cheerios', ['p1', 'p2']],
      ['Corn Flakes', ['p4']],
      ['Shreddies', ['p3']],
    ])
    expect(v.flockId).toBe(groupWith(sim, 'p1'))
  })

  it('lets the host reveal early; others cannot', () => {
    const sim = newGame()
    act(sim, 'p2', { type: 'submit_answer', text: 'Cheerios' })
    expect(sim.act('p2', { type: 'reveal_answers' })).toEqual({ ok: false, error: 'Only the host can reveal the answers' })
    act(sim, 'p1', { type: 'reveal_answers' })
    expect(sim.state.phase).toBe('REVIEW')
    expect(sim.view('p1').groups).toHaveLength(1)
  })

  it('reveals on the answer timer', () => {
    const sim = newGame({ settings: { answerTimerSeconds: 30 } })
    expect(sim.view('p1').deadline).toBe(1_000_000 + 30_000)
    act(sim, 'p1', { type: 'submit_answer', text: 'Cheerios' })
    sim.advance(29_999)
    expect(sim.state.phase).toBe('ANSWERING')
    sim.advance(1)
    expect(sim.state.phase).toBe('REVIEW')
    expect(sim.view('p1').deadline).toBeNull()
  })

  it('does not wait for a disconnected player who has not answered', () => {
    const sim = newGame()
    answerAll(sim, { p1: 'Cheerios', p2: 'Cheerios', p3: 'Muesli' })
    sim.disconnect('p4')
    expect(sim.state.phase).toBe('REVIEW')
  })
})

describe('checking matches', () => {
  function inReview() {
    const sim = newGame()
    answerAll(sim, { p1: 'Coco Pops', p2: 'Cocoa Pops', p3: 'Cheerios', p4: 'Coco Pops' })
    return sim
  }

  it('lets the host merge near-misses, changing the flock', () => {
    const sim = newGame()
    answerAll(sim, { p1: 'Coco Pops', p2: 'Cocoa Pops', p3: 'Cheerios', p4: 'Cheerio' })
    expect(sim.view('p1').flockId).toBe(groupWith(sim, 'p3')) // 2-1-1
    const coco = groupWith(sim, 'p1')
    const cocoa = groupWith(sim, 'p2')
    expect(sim.view('p3').groups.every((g) => !g.merged)).toBe(true)
    act(sim, 'p1', { type: 'merge_groups', from: cocoa, into: coco })
    const v = sim.view('p3')
    expect(v.groups.find((g) => g.id === coco)).toMatchObject({ label: 'Coco Pops', merged: true })
    expect(v.groups.find((g) => g.id === coco)!.answers.map((a) => a.playerId)).toEqual(['p1', 'p2'])
    expect(v.flockId).toBeNull() // now 2 v 2: a tie
  })

  it('only the host merges, and only existing, different groups', () => {
    const sim = inReview()
    const coco = groupWith(sim, 'p1')
    const cocoa = groupWith(sim, 'p2')
    expect(sim.act('p2', { type: 'merge_groups', from: cocoa, into: coco })).toEqual({ ok: false, error: 'Only the host can merge answers' })
    expect(sim.act('p1', { type: 'merge_groups', from: 'nope', into: coco })).toEqual({ ok: false, error: 'That answer is not on the list' })
    expect(sim.act('p1', { type: 'merge_groups', from: coco, into: coco })).toEqual({ ok: false, error: 'Pick two different answers' })
  })

  it('merges chain, and split puts a group back to automatic matches', () => {
    const sim = inReview()
    const coco = groupWith(sim, 'p1')
    const cocoa = groupWith(sim, 'p2')
    const cheerios = groupWith(sim, 'p3')
    act(sim, 'p1', { type: 'merge_groups', from: cocoa, into: coco })
    act(sim, 'p1', { type: 'merge_groups', from: coco, into: cheerios })
    expect(sim.view('p1').groups).toHaveLength(1)
    expect(sim.view('p1').groups[0]!.answers).toHaveLength(4)
    act(sim, 'p1', { type: 'split_group', group: cheerios })
    expect(sim.view('p1').groups.map((g) => g.answers.length)).toEqual([2, 1, 1])
  })

  it('skips the review when Check matches is off', () => {
    const sim = newGame({ settings: { checkMatches: false } })
    answerAll(sim, { p1: 'Cheerios', p2: 'Cheerios', p3: 'Muesli', p4: 'Granola' })
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.state.scores).toEqual({ p1: 1, p2: 1, p3: 0, p4: 0 })
  })
})

describe('scoring', () => {
  function scored(answers: Record<string, string>, settings = {}) {
    const sim = newGame({ settings: { checkMatches: false, ...settings }, players: Object.keys(answers) })
    answerAll(sim, answers)
    return sim
  }

  it('gives the flock a point each and nobody else', () => {
    const sim = scored({ p1: 'Cheerios', p2: 'Cheerios', p3: 'Cheerios', p4: 'Muesli', p5: 'Muesli' })
    expect(sim.view('p1').result!.pointsAwarded).toEqual({ p1: 1, p2: 1, p3: 1, p4: 0, p5: 0 })
    expect(sim.state.scores).toEqual({ p1: 1, p2: 1, p3: 1, p4: 0, p5: 0 })
  })

  it('scores nobody on a tie for biggest, or when all answers differ', () => {
    expect(scored({ p1: 'A', p2: 'A', p3: 'B', p4: 'B' }).state.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 })
    expect(scored({ p1: 'A', p2: 'B', p3: 'C' }).state.scores).toEqual({ p1: 0, p2: 0, p3: 0 })
  })

  it('players who did not answer score nothing', () => {
    const sim = newGame({ settings: { checkMatches: false } })
    answerAll(sim, { p1: 'Cheerios', p2: 'Cheerios' })
    act(sim, 'p1', { type: 'reveal_answers' })
    expect(sim.state.scores).toEqual({ p1: 1, p2: 1, p3: 0, p4: 0 })
  })

  it('the host scores the round from REVIEW', () => {
    const sim = newGame()
    answerAll(sim, { p1: 'Cheerios', p2: 'Cheerios', p3: 'Muesli', p4: 'Granola' })
    expect(sim.act('p2', { type: 'score_round' })).toEqual({ ok: false, error: 'Only the host can score the round' })
    act(sim, 'p1', { type: 'score_round' })
    expect(sim.view('p2').phase).toBe('RESULTS')
    expect(sim.view('p2').scores).toEqual({ p1: 1, p2: 1, p3: 0, p4: 0 })
  })

  it('scores carry over to the next round', () => {
    const sim = newGame({ settings: { checkMatches: false } })
    answerAll(sim, { p1: 'A', p2: 'A', p3: 'B', p4: 'C' })
    expect(sim.act('p2', { type: 'next_round' })).toEqual({ ok: false, error: 'Only the host can start the next round' })
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.state.round).toBe(2)
    expect(sim.view('p1').phase).toBe('ANSWERING')
    expect(sim.view('p1').you.answer).toBeNull()
    expect(sim.view('p1').question.text).toBe(QUESTION_TEXT)
    expect(sim.state.scores).toEqual({ p1: 1, p2: 1, p3: 0, p4: 0 })
  })
})

describe('black sheep', () => {
  function play(sim: ReturnType<typeof newGame>, answers: Record<string, string>) {
    answerAll(sim, answers)
    if (sim.state.phase !== 'RESULTS') throw new Error('expected RESULTS')
  }

  it('goes to the only lone answer, and moves to the next one', () => {
    const sim = newGame({ settings: { checkMatches: false } })
    play(sim, { p1: 'A', p2: 'A', p3: 'A', p4: 'B' })
    expect(sim.view('p1').blackSheepId).toBe('p4')
    expect(sim.view('p1').result).toMatchObject({ blackSheepFrom: null, blackSheepTo: 'p4' })
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.view('p1').blackSheepId).toBe('p4')
    play(sim, { p1: 'A', p2: 'B', p3: 'B', p4: 'B' })
    expect(sim.view('p1').result).toMatchObject({ blackSheepFrom: 'p4', blackSheepTo: 'p1' })
  })

  it('stays put when there are several lone answers or none', () => {
    const sim = newGame({ settings: { checkMatches: false } })
    play(sim, { p1: 'A', p2: 'A', p3: 'B', p4: 'C' })
    expect(sim.state.blackSheepId).toBeNull()
    act(sim, 'p1', { type: 'next_round' })
    play(sim, { p1: 'A', p2: 'A', p3: 'B', p4: 'B' })
    expect(sim.state.blackSheepId).toBeNull()
  })

  it('needs at least three answers', () => {
    const sim = newGame({ settings: { checkMatches: false } })
    answerAll(sim, { p1: 'A', p2: 'B' })
    act(sim, 'p1', { type: 'reveal_answers' })
    expect(sim.state.blackSheepId).toBeNull()
  })

  it('is never handed out when the setting is off', () => {
    const sim = newGame({ settings: { checkMatches: false, blackSheep: false } })
    play(sim, { p1: 'A', p2: 'A', p3: 'A', p4: 'B' })
    expect(sim.state.blackSheepId).toBeNull()
  })

  it('leaves with its holder', () => {
    const sim = newGame({ settings: { checkMatches: false }, players: ['p1', 'p2', 'p3', 'p4', 'p5'] })
    play(sim, { p1: 'A', p2: 'A', p3: 'A', p4: 'B', p5: 'A' })
    sim.remove('p4')
    expect(sim.state.blackSheepId).toBeNull()
  })
})

describe('score limit', () => {
  it('is unlimited by default: no winners, ever', () => {
    const sim = newGame({ settings: { checkMatches: false } })
    for (let i = 0; i < 6; i++) {
      answerAll(sim, { p1: 'A', p2: 'A', p3: 'A', p4: 'B' })
      expect(sim.view('p1').result!.winnerIds).toEqual([])
      act(sim, 'p1', { type: 'next_round' })
    }
    expect(sim.state.scores.p1).toBe(6)
  })

  it('ends the game when players reach the limit; they win together', () => {
    const sim = newGame({ settings: { checkMatches: false, scoreLimit: 2, blackSheep: false } })
    answerAll(sim, { p1: 'A', p2: 'A', p3: 'B', p4: 'C' })
    act(sim, 'p1', { type: 'next_round' })
    answerAll(sim, { p1: 'A', p2: 'A', p3: 'B', p4: 'C' })
    expect(sim.view('p3').result!.winnerIds).toEqual(['p1', 'p2'])
    expect(sim.act('p1', { type: 'next_round' })).toEqual({ ok: false, error: 'The game is over: start a new game' })
  })

  it('the black sheep holder cannot win until it moves on', () => {
    const sim = newGame({ settings: { checkMatches: false, scoreLimit: 1 }, players: ['p1', 'p2', 'p3', 'p4', 'p5'] })
    sim.state = { ...sim.state, blackSheepId: 'p1' }
    answerAll(sim, { p1: 'A', p2: 'A', p3: 'A', p4: 'B', p5: 'C' }) // two lone answers: the black sheep stays with p1
    expect(sim.view('p1').result!.winnerIds).toEqual(['p2', 'p3'])
  })

  it('a holder over the limit wins once the black sheep moves away', () => {
    const sim = newGame({ settings: { checkMatches: false, scoreLimit: 3 } })
    sim.state = { ...sim.state, blackSheepId: 'p1', scores: { p1: 5, p2: 0, p3: 0, p4: 0 } }
    answerAll(sim, { p1: 'A', p2: 'B', p3: 'B', p4: 'C' }) // two lone answers: the black sheep stays, nobody wins
    expect(sim.view('p1').result!.winnerIds).toEqual([])
    act(sim, 'p1', { type: 'next_round' })
    answerAll(sim, { p1: 'A', p2: 'A', p3: 'A', p4: 'B' }) // p4 takes the black sheep
    expect(sim.view('p1').result).toMatchObject({ blackSheepTo: 'p4', winnerIds: ['p1'] })
  })

  it('new game resets scores and the black sheep; only after a win', () => {
    const sim = newGame({ settings: { checkMatches: false, scoreLimit: 1 } })
    answerAll(sim, { p1: 'A', p2: 'A', p3: 'A', p4: 'B' })
    expect(sim.state.result!.winnerIds).toEqual(['p1', 'p2', 'p3'])
    expect(sim.state.blackSheepId).toBe('p4')
    expect(sim.act('p2', { type: 'new_game' })).toEqual({ ok: false, error: 'Only the host can start a new game' })
    act(sim, 'p1', { type: 'new_game' })
    expect(sim.state.phase).toBe('ANSWERING')
    expect(sim.state.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 })
    expect(sim.state.blackSheepId).toBeNull()
    answerAll(sim, { p1: 'A', p2: 'B', p3: 'C', p4: 'D' })
    expect(sim.act('p1', { type: 'new_game' })).toEqual({ ok: false, error: 'The game is not over yet' })
  })
})

describe('questions', () => {
  it('uses the starter list when prepareRound gives none, without repeats', () => {
    const sim = newGame({ settings: { checkMatches: false }, prepare: null })
    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) {
      seen.add(sim.view('p1').question.text)
      act(sim, 'p1', { type: 'reveal_answers' })
      act(sim, 'p1', { type: 'next_round' })
    }
    expect(seen.size).toBe(20)
  })

  it('keeps the starter question inside the chosen category', () => {
    const sim = newGame({ settings: { category: 'animals' }, prepare: null })
    expect(sim.view('p1').question.category).toBe('Animals')
    expect(DEFAULT_QUESTION_LIST.some((q) => q.question === sim.view('p1').question.text)).toBe(true)
  })

  it('tells the host when the library fell back to starter questions', () => {
    const sim = newGame({ prepare: { builtin: true, notice: 'The question library is empty, so starter questions are used.' } })
    expect(sim.noticesFor('p1')).toEqual(['The question library is empty, so starter questions are used.'])
    expect(sim.noticesFor('p2')).toEqual([])
  })

  it('remembers library question ids used this game', () => {
    const sim = newGame({ settings: { checkMatches: false } })
    expect(sim.state.usedQuestionIds).toEqual([7])
  })
})

describe('leavers', () => {
  it('a leaver who held up the reveal unblocks it', () => {
    const sim = newGame()
    answerAll(sim, { p1: 'A', p2: 'A', p3: 'B' })
    sim.remove('p4')
    expect(sim.state.phase).toBe('REVIEW')
    expect(sim.state.scores).not.toHaveProperty('p4')
  })

  it('a leaver in REVIEW takes their answer with them', () => {
    const sim = newGame()
    answerAll(sim, { p1: 'A', p2: 'A', p3: 'B', p4: 'B' })
    expect(sim.view('p1').flockId).toBeNull()
    sim.remove('p4')
    expect(sim.view('p1').flockId).toBe(groupWith(sim, 'p1'))
  })

  it('RESULTS keeps the scored round when someone leaves', () => {
    const sim = newGame({ settings: { checkMatches: false } })
    answerAll(sim, { p1: 'A', p2: 'A', p3: 'B', p4: 'C' })
    sim.remove('p2')
    expect(sim.view('p1').groups[0]!.answers.map((a) => a.playerId)).toEqual(['p1', 'p2'])
  })

  it('seats late joiners at the next round with 0 points', () => {
    const sim = newGame({ settings: { checkMatches: false } })
    sim.join({ id: 'p9' })
    answerAll(sim, { p1: 'A', p2: 'A', p3: 'B', p4: 'C' })
    expect(sim.state.scores).not.toHaveProperty('p9')
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.view('p9').you.status).toBe('playing')
    expect(sim.state.scores.p9).toBe(0)
    expect(sim.state.roundPlayers).toEqual([...PLAYERS, 'p9'])
  })
})
