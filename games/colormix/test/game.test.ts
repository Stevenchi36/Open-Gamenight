import { assertValidGame } from '@ogn/core/contract'
import { describe, expect, it } from 'vitest'
import { colorMix, scoreGuesses } from '../server/game.ts'
import { mixPaint } from '../server/spectral.ts'
import { defaultSettings, type ColorMixSettings } from '../shared/index.ts'
import { act, guessAll, newGame, PLAYERS } from './helpers.ts'

// Greys get steadily further from a mid-grey answer.
const TARGET = '#808080'
const NEAR = '#888888'
const MID = '#a0a0a0'
const FAR = '#ffffff'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(colorMix)).not.toThrow()
  })
})

describe('a round', () => {
  it('shows everyone the colours, but not the answer, and only their own guess', () => {
    const sim = newGame()
    act(sim, 'p1', { type: 'submit_guess', color: '#AABBCC' })
    const mine = sim.view('p1')
    expect(mine.phase).toBe('GUESSING')
    expect(mine.colors).toHaveLength(2)
    expect(mine.colors).toEqual(sim.view('p2').colors)
    expect(mine.target).toBeNull()
    expect(mine.you).toEqual({ status: 'playing', guess: '#aabbcc' })
    expect(sim.view('p2').you.guess).toBeNull()
    expect(sim.view('p2').guessed).toEqual(['p1'])
    expect(sim.state.target).toBe(mixPaint(sim.state.colors))
  })

  it('mixes 2, 3 or 4 colours by difficulty, or a random difficulty each round', () => {
    expect(newGame({ settings: { difficulty: 'medium' } }).view('p1').colors).toHaveLength(3)
    expect(newGame({ settings: { difficulty: 'hard' } }).view('p1').colors).toHaveLength(4)
    const counts = new Set(Array.from({ length: 40 }, (_, seed) => newGame({ seed, settings: { difficulty: 'all' } }).view('p1').colors.length))
    expect([...counts].sort()).toEqual([2, 3, 4])
  })

  it('lets players change their guess, and rejects bad colours and late joiners', () => {
    const sim = newGame()
    act(sim, 'p1', { type: 'submit_guess', color: '#111111' })
    act(sim, 'p1', { type: 'submit_guess', color: '#222222' })
    expect(sim.view('p1').you.guess).toBe('#222222')
    expect(sim.act('p1', { type: 'submit_guess', color: 'red' })).toEqual({ ok: false, error: 'Pick a colour' })
    expect(sim.act('p1', { type: 'submit_guess', color: '#12345' })).toEqual({ ok: false, error: 'Pick a colour' })
    sim.join({ id: 'p9' })
    expect(sim.view('p9').you.status).toBe('waiting')
    expect(sim.act('p9', { type: 'submit_guess', color: '#123456' })).toEqual({ ok: false, error: 'You are not in this round' })
  })

  it('reveals once everyone has guessed, with the answer and ranked guesses', () => {
    const sim = newGame()
    const target = sim.state.target
    guessAll(sim, { p1: '#000000', p2: target, p3: '#ffffff' })
    expect(sim.state.phase).toBe('GUESSING')
    act(sim, 'p4', { type: 'submit_guess', color: target })
    const v = sim.view('p3')
    expect(v.phase).toBe('RESULTS')
    expect(v.target).toBe(target)
    expect(v.result!.guesses.slice(0, 2).map((g) => [g.playerId, g.distance, g.closeness])).toEqual([
      ['p2', 0, 100],
      ['p4', 0, 100],
    ])
    expect(v.result!.guesses).toHaveLength(4)
  })

  it('lets the host reveal early (others cannot); players with no guess score 0', () => {
    const sim = newGame()
    act(sim, 'p2', { type: 'submit_guess', color: '#123456' })
    expect(sim.act('p2', { type: 'reveal_guesses' })).toEqual({ ok: false, error: 'Only the host can reveal the guesses' })
    act(sim, 'p1', { type: 'reveal_guesses' })
    expect(sim.state.phase).toBe('RESULTS')
    // ranked: p2 beats the three who didn't guess
    expect(sim.view('p1').result!.pointsAwarded).toEqual({ p1: 0, p2: 3, p3: 0, p4: 0 })
  })

  it('reveals on the guess timer', () => {
    const sim = newGame({ settings: { guessTimerSeconds: 30 } })
    expect(sim.view('p1').deadline).toBe(1_000_000 + 30_000)
    sim.advance(29_999)
    expect(sim.state.phase).toBe('GUESSING')
    sim.advance(1)
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view('p1').deadline).toBeNull()
  })

  it('does not wait for a disconnected player who has not guessed', () => {
    const sim = newGame()
    guessAll(sim, { p1: '#111111', p2: '#222222', p3: '#333333' })
    sim.disconnect('p4')
    expect(sim.state.phase).toBe('RESULTS')
  })

  it('drops the guess of a player who leaves before the reveal, and keeps a scored round', () => {
    const sim = newGame()
    guessAll(sim, { p1: '#111111', p2: '#222222', p3: '#333333' })
    sim.remove('p3')
    expect(sim.state.phase).toBe('GUESSING')
    act(sim, 'p4', { type: 'submit_guess', color: '#444444' })
    expect(sim.state.phase).toBe('RESULTS')
    expect(sim.view('p1').result!.guesses.map((g) => g.playerId).sort()).toEqual(['p1', 'p2', 'p4'])
    sim.remove('p4')
    expect(sim.view('p1').result!.guesses).toHaveLength(3)
    expect(Object.keys(sim.view('p1').scores)).toEqual(['p1', 'p2'])
  })
})

describe('scoring', () => {
  const settings = (scoring: ColorMixSettings['scoring']): ColorMixSettings => ({ ...defaultSettings, scoring })
  const points = (scoring: ColorMixSettings['scoring'], guesses: Record<string, string>, roundPlayers = Object.keys(guesses)) =>
    Object.fromEntries(scoreGuesses({ roundPlayers, guesses, target: TARGET, settings: settings(scoring) }).map((g) => [g.playerId, g.points]))

  it('ranked: 1 point per player further away', () => {
    expect(points('ranked', { a: MID, b: TARGET, c: FAR })).toEqual({ a: 1, b: 2, c: 0 })
  })

  it('ranked: equal guesses score the same; no guess counts as furthest', () => {
    expect(points('ranked', { a: NEAR, b: NEAR, c: FAR })).toEqual({ a: 1, b: 1, c: 0 })
    expect(points('ranked', { a: NEAR, b: FAR }, ['a', 'b', 'c'])).toEqual({ a: 2, b: 1 })
  })

  it('closest: 1 point for the closest, shared on a tie', () => {
    expect(points('closest', { a: MID, b: NEAR, c: FAR })).toEqual({ a: 0, b: 1, c: 0 })
    expect(points('closest', { a: NEAR, b: NEAR, c: FAR })).toEqual({ a: 1, b: 1, c: 0 })
  })

  it('lists guesses closest first, with closeness', () => {
    const scored = scoreGuesses({ roundPlayers: ['a', 'b', 'c'], guesses: { a: FAR, b: TARGET, c: MID }, target: TARGET, settings: settings('ranked') })
    expect(scored.map((g) => g.playerId)).toEqual(['b', 'c', 'a'])
    expect(scored[0]!.closeness).toBe(100)
    expect(scored[1]!.closeness).toBeLessThan(100)
    expect(scored[1]!.closeness).toBeGreaterThan(scored[2]!.closeness)
  })
})

describe('rounds and winning', () => {
  it('keeps playing with unlimited rounds; only the host starts the next', () => {
    const sim = newGame()
    act(sim, 'p1', { type: 'reveal_guesses' })
    expect(sim.view('p1').result!.winnerIds).toEqual([])
    expect(sim.act('p2', { type: 'next_round' })).toEqual({ ok: false, error: 'Only the host can start the next round' })
    expect(sim.act('p1', { type: 'new_game' })).toEqual({ ok: false, error: 'The game is not over yet' })
    const before = sim.state.colors
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.view('p1')).toMatchObject({ phase: 'GUESSING', round: 2, totalRounds: null, guessed: [] })
    expect(sim.state.colors).not.toEqual(before)
  })

  it('ends after the last round: the highest total wins, ties together; new game resets', () => {
    const sim = newGame({ settings: { rounds: 2 } })
    const round = (guesses: Record<string, 'exact' | 'far'>) => {
      const target = sim.state.target
      guessAll(sim, Object.fromEntries(Object.entries(guesses).map(([id, g]) => [id, g === 'exact' ? target : far(target)])))
    }
    round({ p1: 'exact', p2: 'exact', p3: 'far', p4: 'far' })
    expect(sim.view('p1').result!.winnerIds).toEqual([])
    act(sim, 'p1', { type: 'next_round' })
    round({ p1: 'exact', p2: 'exact', p3: 'far', p4: 'far' })
    const v = sim.view('p3')
    expect(v.scores).toEqual({ p1: 4, p2: 4, p3: 0, p4: 0 })
    expect(v.result!.winnerIds).toEqual(['p1', 'p2'])
    expect(sim.act('p1', { type: 'next_round' })).toEqual({ ok: false, error: 'The game is over: start a new game' })
    act(sim, 'p1', { type: 'new_game' })
    expect(sim.view('p1')).toMatchObject({ phase: 'GUESSING', round: 1, scores: { p1: 0, p2: 0, p3: 0, p4: 0 } })
  })

  it('ignores a timer left over from an earlier round', () => {
    const sim = newGame({ settings: { guessTimerSeconds: 30 } })
    act(sim, 'p1', { type: 'reveal_guesses' })
    act(sim, 'p1', { type: 'next_round' })
    sim.advance(29_000)
    expect(sim.state.phase).toBe('GUESSING')
  })

  it('carries scores into the next round for everyone present', () => {
    const sim = newGame()
    guessAll(sim, { p1: sim.state.target, p2: '#000000', p3: '#000000', p4: '#000000' })
    act(sim, 'p1', { type: 'next_round' })
    expect(sim.view('p2').scores).toEqual({ p1: 3, p2: 0, p3: 0, p4: 0 })
    expect(PLAYERS.every((id) => sim.view(id).you.status === 'playing')).toBe(true)
  })
})

/** Black or white, whichever is further from the colour: never tied with an exact guess. */
function far(hex: string): string {
  return parseInt(hex.slice(1, 3), 16) > 127 ? '#000000' : '#ffffff'
}
