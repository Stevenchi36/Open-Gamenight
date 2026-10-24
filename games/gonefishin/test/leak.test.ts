import { RANKS } from '@wsfg/core/kit'
import { runLeakTest, type Move } from '@wsfg/core/testing'
import { describe, expect, it } from 'vitest'
import { goneFishin } from '../server/game.ts'
import { defaultSettings, type ClientAction, type GoneFishinSettings } from '../shared/index.ts'
import type { Sim } from './helpers.ts'

const players = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id }))

/**
 * The current player's asks for ranks they hold, of every other player, plus a few that break
 * the rules (an out-of-turn ask, a rank nobody may hold) and the host's new game.
 */
function moves(sim: Sim): Move<ClientAction>[] {
  const out: Move<ClientAction>[] = []
  const { turn, hands } = sim.state
  if (turn) {
    const held = RANKS.filter((rank) => hands[turn]?.some((c) => c.rank === rank))
    for (const { id: targetId } of sim.players) {
      if (targetId === turn) continue
      for (const rank of held) out.push({ actorId: turn, action: { type: 'ask', targetId, rank } })
      out.push({ actorId: targetId, action: { type: 'ask', targetId: turn, rank: 'A' } })
    }
  }
  out.push({ actorId: sim.hostId, action: { type: 'new_game' } })
  return out
}

const configs: Array<[string, Partial<GoneFishinSettings>]> = [
  ['defaults', {}],
  ['no lucky catch', { luckyCatch: false }],
]

describe("gone fishin' secret-leak test", () => {
  it.each(configs)('%s', (_name, settings) => {
    const result = runLeakTest(goneFishin, {
      players,
      latePlayers: [{ id: 'late1' }],
      settings: { ...defaultSettings, ...settings },
      // Fewer seeds than Liar's Dice: each step checks four viewers against a growing move log.
      seeds: Array.from({ length: 10 }, (_, i) => i + 1),
      maxSteps: 500,
      moves,
    })
    expect(result.leaks).toEqual([])
    expect(result.phasesSeen).toEqual(['PLAYING', 'RESULTS'])
  }, 20_000)
})
