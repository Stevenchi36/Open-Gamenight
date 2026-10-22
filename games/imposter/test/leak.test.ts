import { runLeakTest, type Move } from '@wsfg/core/testing'
import { describe, expect, it } from 'vitest'
import { imposter, type ImposterAction } from '../server/game.ts'
import { defaultSettings, type ImposterSettings } from '../shared/index.ts'
import type { Sim } from './helpers.ts'

const players = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ({ id }))

/** Every plausible move, valid or not; the harness picks one at random per step. */
function moves(sim: Sim): Move<ImposterAction>[] {
  const ids = sim.players.map((p) => p.id)
  const word = sim.state.secret.word
  const out: Move<ImposterAction>[] = []
  for (const actorId of ids) {
    for (const clue of [word, word.toUpperCase(), 'cold', 'bird', `c${sim.state.turnIndex}`]) {
      out.push({ actorId, action: { type: 'submit_clue', word: clue } })
    }
    out.push({ actorId, action: { type: 'end_turn' } })
    for (const targetId of ids) out.push({ actorId, action: { type: 'cast_vote', targetId } })
    for (const guess of [word, word.toUpperCase(), 'nope']) out.push({ actorId, action: { type: 'submit_guess', word: guess } })
    out.push({ actorId, action: { type: 'judge_guess', correct: true } })
    out.push({ actorId, action: { type: 'judge_guess', correct: false } })
  }
  for (const type of ['start_voting', 'end_voting', 'skip_guess', 'next_round'] as const) {
    out.push({ actorId: sim.hostId, action: { type } })
  }
  return out
}

const configs: Array<[string, Partial<ImposterSettings>]> = [
  ['typed, bonus, category', {}],
  ['spoken, steal, category+hint, timer', { clueMode: 'spoken', guessMode: 'steal', imposterHint: 'category+hint', clueTimerSeconds: 20 }],
  ['typed, off, no hint, timer', { guessMode: 'off', imposterHint: 'none', clueTimerSeconds: 10 }],
]

describe('imposter secret-leak test', () => {
  it.each(configs)('%s', (_name, settings) => {
    const result = runLeakTest(imposter, {
      players,
      latePlayers: [{ id: 'late1' }, { id: 'late2' }],
      settings: { ...defaultSettings, ...settings },
      seeds: Array.from({ length: 30 }, (_, i) => i + 1),
      maxSteps: 300,
      moves,
    })
    expect(result.leaks).toEqual([])
    const expected = ['CLUES', 'REVEAL', 'RESULTS', 'VOTING']
    if (settings.guessMode !== 'off') expected.push('GUESS_CHECK')
    expect(result.phasesSeen).toEqual(expected.sort())
  })
})
