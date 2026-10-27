import { runLeakTest, type Move } from '@ogn/core/testing'
import { describe, expect, it } from 'vitest'
import { colorMix } from '../server/game.ts'
import { defaultSettings, type ClientAction, type ColorMixSettings } from '../shared/index.ts'
import type { Sim } from './helpers.ts'

const players = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ({ id }))

/** Every plausible move, valid or not; the harness picks one at random per step. */
function moves(sim: Sim): Move<ClientAction>[] {
  const out: Move<ClientAction>[] = []
  // A small pool, so equal guesses and exact hits both happen.
  const pool = ['#000000', '#ffffff', '#808080', '#FF0000', 'nope', sim.state.target]
  for (const { id: actorId } of sim.players) {
    for (const color of pool) out.push({ actorId, action: { type: 'submit_guess', color } })
  }
  for (const type of ['reveal_guesses', 'next_round', 'new_game'] as const) out.push({ actorId: sim.hostId, action: { type } })
  return out
}

const configs: Array<[string, Partial<ColorMixSettings>]> = [
  ['defaults (ranked, unlimited, 2 colours)', {}],
  ['closest, 2 rounds, all difficulties, timer', { scoring: 'closest', rounds: 2, difficulty: 'all', guessTimerSeconds: 30 }],
]

describe('colormix secret-leak test', () => {
  it.each(configs)('%s', (_name, settings) => {
    const result = runLeakTest(colorMix, {
      players,
      latePlayers: [{ id: 'late1' }, { id: 'late2' }],
      settings: { ...defaultSettings, ...settings },
      seeds: Array.from({ length: 30 }, (_, i) => i + 1),
      maxSteps: 300,
      moves,
    })
    expect(result.leaks).toEqual([])
    expect(result.phasesSeen).toEqual(['GUESSING', 'RESULTS'])
  })
})
