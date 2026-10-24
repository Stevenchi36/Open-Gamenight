import { RANKS, type Card, type Rank, type Suit } from '@wsfg/core/kit'
import { createSim, type GameSim } from '@wsfg/core/testing'
import { goneFishin, type GoneFishinState, type GoneFishinTimer } from '../server/game.ts'
import { defaultSettings, type ClientAction, type GoneFishinSettings, type GoneFishinView } from '../shared/index.ts'

export type Sim = GameSim<GoneFishinState, ClientAction, GoneFishinTimer, GoneFishinView, GoneFishinSettings>

export const PLAYERS = ['p1', 'p2', 'p3']

interface Options {
  settings?: Partial<GoneFishinSettings>
  players?: string[]
  seed?: number
}

export function newGame(options: Options = {}): Sim {
  return createSim(goneFishin, {
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

/**
 * Replace the deal: hands by seat (in seat order), the pond (top first) and books already down.
 * Whoever is first in seat order gets the turn.
 */
export function setTable(sim: Sim, table: { hands: string[][]; pond?: string[]; books?: Rank[][] }): string[] {
  const seats = sim.state.seats
  const hands: Record<string, Card[]> = {}
  const books: Record<string, Rank[]> = {}
  seats.forEach((id, i) => {
    hands[id] = cards(...(table.hands[i] ?? []))
    books[id] = table.books?.[i] ?? []
  })
  sim.state = { ...sim.state, hands, books, pond: cards(...(table.pond ?? [])), turn: seats[0]!, log: [] }
  return seats
}

/** Every rank but these, for filling `books` so a test can play the last few. */
export function booksExcept(...ranks: Rank[]): Rank[] {
  return RANKS.filter((r) => !ranks.includes(r))
}

export function act(sim: Sim, actorId: string, action: ClientAction): void {
  const result = sim.act(actorId, action)
  if (!result.ok) throw new Error(`${actorId}: ${result.error}`)
}
