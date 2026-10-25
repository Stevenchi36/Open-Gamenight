import { runLeakTest, type Move } from '@wsfg/core/testing'
import { describe, expect, it } from 'vitest'
import { inOrder } from '../server/game.ts'
import { defaultSettings, type ClientAction, type InOrderSettings } from '../shared/index.ts'
import { THEME, type Sim } from './helpers.ts'

const players = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => ({ id }))

/** Every plausible move, valid or not; the harness picks one at random per step. */
function moves(sim: Sim): Move<ClientAction>[] {
  const out: Move<ClientAction>[] = []
  const ids = sim.state.line
  for (const card of Object.values(sim.state.cards)) {
    // Owners only (others are refused regardless); a clue naming the number is refused too.
    out.push({ actorId: card.playerId, action: { type: 'submit_clue', itemId: card.id, text: `clue ${card.id}` } })
    out.push({ actorId: card.playerId, action: { type: 'submit_clue', itemId: card.id, text: `about ${card.number}` } })
  }
  // Who moves a card doesn't matter, so the movers take turns rather than multiplying the list.
  ids.forEach((itemId, i) => {
    const actorId = sim.players[i % sim.players.length]!.id
    for (const to of [0, ids.length - 1]) out.push({ actorId, action: { type: 'move_item', itemId, to } })
  })
  for (const { id: actorId } of sim.players) {
    // Ready is the only way to reveal without the host, so weigh it up.
    for (let i = 0; i < 3; i++) out.push({ actorId, action: { type: 'set_ready', ready: true } })
    out.push({ actorId, action: { type: 'set_ready', ready: false } })
  }
  const host = sim.hostId
  for (const type of ['reveal_now', 'next_round', 'new_game'] as const) out.push({ actorId: host, action: { type } })
  return out
}

const configs: Array<[string, Partial<InOrderSettings>]> = [
  ['defaults (1 number each, 5 rounds, 3 lives)', {}],
  ['2 numbers each, unlimited rounds, 1 life', { numbersEach: 2, rounds: null, lives: 1 }],
]

describe('in order secret-leak test', () => {
  it.each(configs)('%s', (_name, settings) => {
    const result = runLeakTest(inOrder, {
      players,
      latePlayers: [{ id: 'late1' }, { id: 'late2' }],
      settings: { ...defaultSettings, ...settings },
      seeds: Array.from({ length: 20 }, (_, i) => i + 1),
      maxSteps: 250,
      prepare: () => THEME,
      moves,
    })
    expect(result.leaks).toEqual([])
    expect(result.phasesSeen).toEqual(['ORDERING', 'RESULTS'])
  }, 20_000)
})
