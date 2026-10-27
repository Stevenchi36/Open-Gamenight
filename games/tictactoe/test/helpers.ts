import { createSim, type GameSim } from '@ogn/core/testing'
import { ticTacToe, type TicTacToeState } from '../server/game.ts'
import { defaultSettings, type ClientAction, type TicTacToeSettings, type TicTacToeView } from '../shared/index.ts'

export type Sim = GameSim<TicTacToeState, ClientAction, never, TicTacToeView, TicTacToeSettings>

export const PLAYERS = ['p1', 'p2']

export function newGame(seed = 1): Sim {
  return createSim(ticTacToe, {
    players: PLAYERS.map((id) => ({ id, name: id.toUpperCase() })),
    settings: defaultSettings,
    seed,
    now: 1_000_000,
  })
}

export function act(sim: Sim, actorId: string, action: ClientAction): void {
  const result = sim.act(actorId, action)
  if (!result.ok) throw new Error(`${actorId}: ${result.error}`)
}

/** Plays the cells in order, X and O alternating from whoever is to move. */
export function play(sim: Sim, cells: number[]): void {
  for (const cell of cells) act(sim, sim.state.turn!, { type: 'place', cell })
}
