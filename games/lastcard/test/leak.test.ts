import { runLeakTest, type Move } from '@ogn/core/testing'
import { describe, expect, it } from 'vitest'
import { lastCard } from '../server/game.ts'
import { canJumpIn, canPlay, COLORS, defaultSettings, type ClientAction, type LastCardSettings, type LcCard } from '../shared/index.ts'
import type { Sim } from './helpers.ts'

const players = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id }))

/**
 * Mostly legal moves, so rounds get played out: the player to move plays each card that fits
 * (with a colour, a swap target and sometimes a Last card! call) or draws, then plays or keeps
 * the drawn card; others jump in with identical cards, catch or call. A few refused moves
 * (out of turn, keeping before drawing) and the host's next round round it off.
 */
function moves(sim: Sim): Move<ClientAction>[] {
  const s = sim.state
  const out: Move<ClientAction>[] = [{ actorId: sim.hostId, action: { type: 'next_round' } }]
  if (s.phase !== 'PLAYING') return out
  const ids = sim.players.map((p) => p.id)
  const table = { top: s.discard.at(-1)!, color: s.color, pendingDraw: s.pendingDraw }
  const playOf = (actorId: string, card: LcCard, i: number): Move<ClientAction> => ({
    actorId,
    action: {
      type: 'play',
      card,
      color: COLORS[(i + s.round) % COLORS.length],
      swapWith: ids.filter((id) => id !== actorId)[i % (ids.length - 1)],
      lastCard: i % 2 === 0,
    },
  })

  for (const actorId of ids) {
    const hand = s.hands[actorId] ?? []
    if (actorId === s.turn) {
      if (s.stage === 'drawn') {
        out.push(playOf(actorId, s.drawn!, hand.length), { actorId, action: { type: 'pass' } })
      } else {
        // Plays are listed several times over, so most rounds end within the step budget.
        hand.forEach((card, i) => canPlay(card, hand, table) && out.push(...Array(4).fill(playOf(actorId, card, i))))
        out.push({ actorId, action: { type: 'draw' } })
      }
    } else {
      hand.forEach((card, i) => canJumpIn(card, table) && out.push(playOf(actorId, card, i)))
      if (s.exposed && s.exposed !== actorId) out.push({ actorId, action: { type: 'catch', targetId: s.exposed } })
    }
  }
  // Refused: a play out of turn, keeping before drawing.
  const other = ids.find((id) => id !== s.turn && (s.hands[id]?.length ?? 0) > 0)
  if (other) out.push(playOf(other, s.hands[other]![0]!, 0))
  if (s.turn && s.stage === 'play') out.push({ actorId: s.turn, action: { type: 'pass' } })
  if (s.exposed) out.push({ actorId: s.exposed, action: { type: 'call' } })
  return out
}

const configs: Array<[string, Partial<LastCardSettings>]> = [
  ['defaults', {}],
  ['every house rule, rounds scoring', { scoring: 'rounds', stacking: true, drawUntilPlayable: true, sevenZero: true, jumpIn: true }],
  ['automatic call, low target', { lastCall: 'auto', target: 100 }],
]

describe('last card secret-leak test', () => {
  it.each(configs)('%s', (_name, settings) => {
    const result = runLeakTest(lastCard, {
      players,
      latePlayers: [{ id: 'late1' }],
      settings: { ...defaultSettings, ...settings },
      // Few seeds: each step checks five viewers against a growing move log.
      seeds: Array.from({ length: 6 }, (_, i) => i + 1),
      maxSteps: 400,
      moves,
    })
    expect(result.leaks).toEqual([])
    expect(result.phasesSeen).toEqual(['PLAYING', 'RESULTS'])
  }, 30_000)
})
