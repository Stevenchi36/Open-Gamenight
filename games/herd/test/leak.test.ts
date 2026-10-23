import { runLeakTest, type Move } from '@wsfg/core/testing'
import { describe, expect, it } from 'vitest'
import { buildGroups, herd } from '../server/game.ts'
import { defaultSettings, type ClientAction, type HerdSettings } from '../shared/index.ts'
import { QUESTION, type Sim } from './helpers.ts'

const players = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ({ id }))

/** Every plausible move, valid or not; the harness picks one at random per step. */
function moves(sim: Sim): Move<ClientAction>[] {
  const out: Move<ClientAction>[] = []
  // A small answer pool, so matches, ties and lone answers all happen.
  for (const { id: actorId } of sim.players) {
    for (const text of ['Cheerios', 'cheerios!', 'Muesli', 'Granola', `x${actorId}`]) {
      out.push({ actorId, action: { type: 'submit_answer', text } })
    }
  }
  const host = sim.hostId
  const groups = sim.state.phase === 'REVIEW' ? buildGroups(sim.state).map((g) => g.id) : []
  for (const from of groups) {
    out.push({ actorId: host, action: { type: 'split_group', group: from } })
    for (const into of groups) out.push({ actorId: host, action: { type: 'merge_groups', from, into } })
  }
  for (const type of ['reveal_answers', 'score_round', 'next_round', 'new_game'] as const) out.push({ actorId: host, action: { type } })
  return out
}

const configs: Array<[string, Partial<HerdSettings>]> = [
  ['defaults (check matches, black sheep, unlimited)', {}],
  ['no check, score limit 2, timer', { checkMatches: false, scoreLimit: 2, answerTimerSeconds: 30 }],
  ['no black sheep, score limit 3', { blackSheep: false, scoreLimit: 3 }],
]

describe('flock secret-leak test', () => {
  it.each(configs)('%s', (_name, settings) => {
    const result = runLeakTest(herd, {
      players,
      latePlayers: [{ id: 'late1' }, { id: 'late2' }],
      settings: { ...defaultSettings, ...settings },
      seeds: Array.from({ length: 30 }, (_, i) => i + 1),
      maxSteps: 300,
      prepare: () => QUESTION,
      moves,
    })
    expect(result.leaks).toEqual([])
    const expected = ['ANSWERING', 'RESULTS']
    if (settings.checkMatches !== false) expected.push('REVIEW')
    expect(result.phasesSeen).toEqual(expected.sort())
  })
})
