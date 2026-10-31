import { runLeakTest, type Move } from '@ogn/core/testing'
import { describe, expect, it } from 'vitest'
import { oldMaid } from '../server/game.ts'
import { defaultSettings, type ClientAction, type OldMaidSettings } from '../shared/index.ts'
import type { Sim } from './helpers.ts'

const players = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id }))

/**
 * The turn player's draws (a few places, one past the end), someone else's draw, rearranging
 * and shuffling hands, and the host's next round. With four players a round runs long, so the
 * draws come up several times over to keep the playthroughs moving.
 */
function moves(sim: Sim): Move<ClientAction>[] {
  const out: Move<ClientAction>[] = []
  const { turn, hands } = sim.state
  if (turn) {
    for (let i = 0; i < 4; i++) out.push({ actorId: turn, action: { type: 'draw', index: i } })
    const other = sim.players.find((p) => p.id !== turn)
    if (other) out.push({ actorId: other.id, action: { type: 'draw', index: 0 } })
  }
  for (const { id } of sim.players) {
    const n = hands[id]?.length ?? 0
    if (n > 1) out.push({ actorId: id, action: { type: 'arrange', order: Array.from({ length: n }, (_, i) => n - 1 - i) } })
  }
  out.push({ actorId: sim.players[1]?.id ?? sim.hostId, action: { type: 'shuffle' } })
  out.push({ actorId: sim.hostId, action: { type: 'next_round' } })
  return out
}

const configs: Array<[string, Partial<OldMaidSettings>]> = [
  ['defaults', {}],
  ['arrange hand', { arrange: true }],
  ['match colour', { matchColour: true }],
  ['royale', { format: 'royale' }],
  ['royale, arrange hand', { format: 'royale', arrange: true }],
]

describe('old maid secret-leak test', () => {
  it.each(configs)('%s', (_name, settings) => {
    const result = runLeakTest(oldMaid, {
      players,
      latePlayers: [{ id: 'late1' }],
      settings: { ...defaultSettings, ...settings },
      seeds: Array.from({ length: 6 }, (_, i) => i + 1),
      maxSteps: 250,
      moves,
    })
    expect(result.leaks).toEqual([])
    expect(result.phasesSeen).toEqual(['PLAYING', 'RESULTS'])
  })

  it('covers a leaver mid-round', () => {
    const result = runLeakTest(oldMaid, {
      players,
      settings: { ...defaultSettings, arrange: true },
      seeds: [1, 2, 3],
      maxSteps: 60,
      moves: (sim) => {
        // Once, early on, the third player leaves.
        if (sim.state.log.length === 3 && sim.players.some((p) => p.id === 'p3')) sim.remove('p3')
        return moves(sim)
      },
    })
    expect(result.leaks).toEqual([])
  })
})
