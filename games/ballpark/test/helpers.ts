import { createSim, type GameSim } from '@ogn/core/testing'
import { ballpark, type BallparkState, type BallparkTimer, type PreparedQuestion } from '../server/game.ts'
import { defaultSettings, type BallparkSettings, type BallparkView, type Bet, type ClientAction } from '../shared/index.ts'

export type Sim = GameSim<BallparkState, ClientAction, BallparkTimer, BallparkView, BallparkSettings, PreparedQuestion>

export const PLAYERS = ['p1', 'p2', 'p3', 'p4']
export const QUESTION: PreparedQuestion = {
  id: 7,
  category: 'Landmarks',
  text: 'How tall is the Eiffel Tower?',
  answer: 330,
  unit: 'm',
  fact: 'Including the antennas on top',
}

interface Options {
  settings?: Partial<BallparkSettings>
  players?: string[]
  /** null: no prepareRound output, so the starter list is used. */
  prepare?: PreparedQuestion | null
  seed?: number
}

export function newGame(options: Options = {}): Sim {
  const prepared = options.prepare === undefined ? QUESTION : options.prepare
  return createSim(ballpark, {
    players: (options.players ?? PLAYERS).map((id) => ({ id, name: id.toUpperCase() })),
    settings: { ...defaultSettings, ...options.settings },
    seed: options.seed ?? 1,
    now: 1_000_000,
    ...(prepared ? { prepare: () => prepared } : {}),
  })
}

export function act(sim: Sim, actorId: string, action: ClientAction): void {
  const result = sim.act(actorId, action)
  if (!result.ok) throw new Error(`${actorId}: ${result.error}`)
}

/** Each listed player guesses (in order). */
export function guessAll(sim: Sim, guesses: Record<string, number>): void {
  for (const [id, value] of Object.entries(guesses)) act(sim, id, { type: 'submit_guess', value })
}

/** The slot id holding this value, or TOO_HIGH for null. */
export function slotOf(sim: Sim, value: number | null): string {
  return sim.state.slots.find((s) => s.value === value)!.id
}

/** Both tokens on one slot, no stake. */
export const both = (slot: string, stake = 0): Bet[] => [
  { slot, stake },
  { slot, stake: 0 },
]

/** Each listed player places these bets (in order). */
export function betAll(sim: Sim, bets: Record<string, Bet[]>): void {
  for (const [id, b] of Object.entries(bets)) act(sim, id, { type: 'place_bets', bets: b })
}
