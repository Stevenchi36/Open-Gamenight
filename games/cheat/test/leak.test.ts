import { runLeakTest, type Move } from '@wsfg/core/testing'
import { describe, expect, it } from 'vitest'
import { cheat } from '../server/game.ts'
import { allowedClaims, defaultSettings, type CheatSettings, type ClientAction } from '../shared/index.ts'
import type { Sim } from './helpers.ts'

const players = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id }))

/**
 * The turn player's plays (a true one when they can, a lie, and two cards), calls on the
 * latest play from everyone, a stale call, and the host's new game. Calls are a few of many
 * candidates, so plays still build up a pile between them.
 */
function moves(sim: Sim): Move<ClientAction>[] {
  const out: Move<ClientAction>[] = []
  const { turn, hands, settings, lastClaim, plays } = sim.state
  if (turn) {
    const hand = hands[turn] ?? []
    for (const claim of allowedClaims(settings.claims, lastClaim)) {
      const truth = hand.filter((c) => c.rank === claim)
      if (truth.length > 0) out.push({ actorId: turn, action: { type: 'play', cards: truth, claim } })
      if (hand[0]) out.push({ actorId: turn, action: { type: 'play', cards: [hand[0]], claim } })
      if (hand.length >= 2) out.push({ actorId: turn, action: { type: 'play', cards: hand.slice(-2), claim } })
    }
  }
  for (const { id } of sim.players) out.push({ actorId: id, action: { type: 'call', play: plays } })
  out.push({ actorId: sim.players[0]!.id, action: { type: 'call', play: Math.max(1, plays - 1) } })
  out.push({ actorId: sim.hostId, action: { type: 'new_game' } })
  return out
}

const configs: Array<[string, Partial<CheatSettings>]> = [
  ['defaults', {}],
  ['nearby claims', { claims: 'nearby' }],
]

describe('cheat secret-leak test', () => {
  it.each(configs)('%s', (_name, settings) => {
    const result = runLeakTest(cheat, {
      players,
      latePlayers: [{ id: 'late1' }],
      settings: { ...defaultSettings, ...settings },
      seeds: Array.from({ length: 10 }, (_, i) => i + 1),
      maxSteps: 400,
      moves,
    })
    expect(result.leaks).toEqual([])
    expect(result.phasesSeen).toEqual(['PLAYING', 'RESULTS'])
  }, 30_000)
})
