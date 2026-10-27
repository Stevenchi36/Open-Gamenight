import type { Card, Rank, Suit } from '@wsfg/core/kit'
import { createSim, type GameSim } from '@wsfg/core/testing'
import { oldMaid, type OldMaidState, type OldMaidTimer } from '../server/game.ts'
import { defaultSettings, type ClientAction, type OldMaidSettings, type OldMaidView } from '../shared/index.ts'

export type Sim = GameSim<OldMaidState, ClientAction, OldMaidTimer, OldMaidView, OldMaidSettings>

export const PLAYERS = ['p1', 'p2', 'p3']

interface Options {
  settings?: Partial<OldMaidSettings>
  players?: string[]
  seed?: number
}

export function newGame(options: Options = {}): Sim {
  return createSim(oldMaid, {
    players: (options.players ?? PLAYERS).map((id) => ({ id, name: id.toUpperCase() })),
    settings: { ...defaultSettings, ...options.settings },
    seed: options.seed ?? 1,
    now: 1_000_000,
  })
}

/** Cards from short codes: '7S', '10H', 'QD'. */
export function cards(...codes: string[]): Card[] {
  return codes.map((code) => ({ rank: code.slice(0, -1) as Rank, suit: code.slice(-1) as Suit }))
}

export const codes = (hand: readonly Card[]) => hand.map((c) => c.rank + c.suit)

/**
 * Replace the deal: hands by seat, in the round's seat order (`state.dealt`), already pair-free.
 * Whoever is first in seat order gets the turn (or `turn`).
 */
export function setTable(sim: Sim, table: { hands: string[][]; turn?: number }): string[] {
  const seats = sim.state.dealt
  const hands: Record<string, Card[]> = {}
  seats.forEach((id, i) => (hands[id] = cards(...(table.hands[i] ?? []))))
  sim.state = {
    ...sim.state,
    hands,
    discard: [],
    pairs: Object.fromEntries(seats.map((id) => [id, 0])),
    out: seats.filter((id) => hands[id]!.length === 0),
    turn: seats[table.turn ?? 0]!,
    log: [],
  }
  return seats
}

export function act(sim: Sim, actorId: string, action: ClientAction): void {
  const result = sim.act(actorId, action)
  if (!result.ok) throw new Error(`${actorId}: ${result.error}`)
}

/** The turn player takes the card at `index` from whoever they draw from. */
export function drawCard(sim: Sim, index = 0): void {
  act(sim, sim.state.turn!, { type: 'draw', index })
}
