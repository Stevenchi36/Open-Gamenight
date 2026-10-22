import { runLeakTest, type Move } from '@wsfg/core/testing'
import { describe, expect, it } from 'vitest'
import { liarsDice, type LiarsDiceAction } from '../server/game.ts'
import { defaultSettings, FACES, minQuantity, type LiarsDiceSettings } from '../shared/index.ts'
import type { Sim } from './helpers.ts'

const players = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id }))

/** Every plausible move: each player tries the smallest raise on every face and the calls; the host a new match. */
function moves(sim: Sim): Move<LiarsDiceAction>[] {
  const { bids, settings } = sim.state
  const prev = bids.at(-1) ?? null
  const out: Move<LiarsDiceAction>[] = []
  for (const { id: actorId } of sim.players) {
    for (let face = 1; face <= FACES; face++) {
      const quantity = minQuantity(prev, face, settings.wildOnes)
      if (quantity !== null) out.push({ actorId, action: { type: 'bid', quantity, face } })
    }
    // Weighted toward calls so matches finish within the step budget.
    for (let i = 0; i < 4; i++) out.push({ actorId, action: { type: 'call' } }, { actorId, action: { type: 'spot_on' } })
  }
  out.push({ actorId: sim.hostId, action: { type: 'new_match' } })
  return out
}

const configs: Array<[string, Partial<LiarsDiceSettings>]> = [
  ['defaults', {}],
  ['spot on, no wild ones, 2 dice', { spotOn: true, wildOnes: false, startingDice: 2 }],
]

describe("liar's dice secret-leak test", () => {
  it.each(configs)('%s', (_name, settings) => {
    const result = runLeakTest(liarsDice, {
      players,
      latePlayers: [{ id: 'late1' }],
      settings: { ...defaultSettings, ...settings },
      seeds: Array.from({ length: 30 }, (_, i) => i + 1),
      maxSteps: 600,
      moves,
    })
    expect(result.leaks).toEqual([])
    expect(result.phasesSeen).toEqual(['BIDDING', 'RESULTS', 'REVEAL'])
  })
})
