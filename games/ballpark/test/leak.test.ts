import { runLeakTest, type Move } from '@wsfg/core/testing'
import { describe, expect, it } from 'vitest'
import { ballpark } from '../server/game.ts'
import { defaultSettings, type BallparkSettings, type ClientAction } from '../shared/index.ts'
import { QUESTION, type Sim } from './helpers.ts'

const players = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ({ id }))

/** Every plausible move, valid or not; the harness picks one at random per step. */
function moves(sim: Sim): Move<ClientAction>[] {
  const out: Move<ClientAction>[] = []
  const slots = sim.state.slots.map((s) => s.id)
  for (const { id: actorId } of sim.players) {
    // A small pool around the answer (330), so shared slots, ties and All too high all happen.
    for (const value of [100, 300, 330, 360, 500]) out.push({ actorId, action: { type: 'submit_guess', value } })
    for (const a of slots) {
      for (const b of slots) {
        out.push({ actorId, action: { type: 'place_bets', bets: [{ slot: a, stake: 0 }, { slot: b, stake: 0 }] } })
      }
      out.push({ actorId, action: { type: 'place_bets', bets: [{ slot: a, stake: 2 }, { slot: a, stake: 0 }] } })
    }
  }
  const host = sim.hostId
  for (const type of ['reveal_guesses', 'reveal_answer', 'next_round', 'new_game'] as const) out.push({ actorId: host, action: { type } })
  return out
}

const configs: Array<[string, Partial<BallparkSettings>]> = [
  ['defaults (over, odds, hidden bets)', {}],
  ['closest, chips, public bets, 3 rounds, timer', { winRule: 'closest', scoring: 'chips', bets: 'public', rounds: 3, timerSeconds: 30 }],
  ['over, flat, hidden bets, imperial, unlimited', { scoring: 'flat', units: 'imperial', rounds: null }],
  ['closest, chips, hidden bets', { winRule: 'closest', scoring: 'chips' }],
]

describe('ballpark secret-leak test', () => {
  it.each(configs)('%s', (_name, settings) => {
    const result = runLeakTest(ballpark, {
      players,
      latePlayers: [{ id: 'late1' }, { id: 'late2' }],
      settings: { ...defaultSettings, ...settings },
      seeds: Array.from({ length: 30 }, (_, i) => i + 1),
      maxSteps: 300,
      prepare: () => QUESTION,
      moves,
    })
    expect(result.leaks).toEqual([])
    expect(result.phasesSeen).toEqual(['BETTING', 'GUESSING', 'RESULTS'])
  })
})
