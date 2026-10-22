import { createSim, type GameSim } from '@wsfg/core/testing'
import { liarsDice, type LiarsDiceAction, type LiarsDiceState } from '../server/game.ts'
import { defaultSettings, type LiarsDiceSettings, type LiarsDiceView } from '../shared/index.ts'

export type Sim = GameSim<LiarsDiceState, LiarsDiceAction, LiarsDiceView, LiarsDiceSettings>

export const PLAYERS = ['p1', 'p2', 'p3']

interface Options {
  settings?: Partial<LiarsDiceSettings>
  players?: string[]
  seed?: number
}

export function newGame(options: Options = {}): Sim {
  return createSim(liarsDice, {
    players: (options.players ?? PLAYERS).map((id) => ({ id, name: id.toUpperCase() })),
    settings: { ...defaultSettings, ...options.settings },
    seed: options.seed ?? 1,
    now: 1_000_000,
  })
}

/** Replace this round's roll (counts follow the dice given). */
export function setDice(sim: Sim, dice: Record<string, number[]>): void {
  const diceCount = { ...sim.state.diceCount }
  for (const [id, d] of Object.entries(dice)) diceCount[id] = d.length
  sim.state = { ...sim.state, dice, diceCount }
}

/** The seat after the current player (the one who answers their bid). */
export function nextSeat(sim: Sim, id = sim.state.turn!): string {
  const seats = sim.state.seats
  return seats[(seats.indexOf(id) + 1) % seats.length]!
}

export function act(sim: Sim, actorId: string, action: LiarsDiceAction): void {
  const result = sim.act(actorId, action)
  if (!result.ok) throw new Error(`${actorId}: ${result.error}`)
}
