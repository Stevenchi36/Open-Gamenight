import { createSim, type GameSim } from '@ogn/core/testing'
import { dropLine, type DropLineState } from '../server/game.ts'
import { defaultSettings, type ClientAction, type DropLineSettings, type DropLineView } from '../shared/index.ts'

export type Sim = GameSim<DropLineState, ClientAction, never, DropLineView, DropLineSettings>

export const PLAYERS = ['p1', 'p2']

export function newGame(settings: Partial<DropLineSettings> = {}, seed = 1): Sim {
  return createSim(dropLine, {
    players: PLAYERS.map((id) => ({ id, name: id.toUpperCase() })),
    settings: { ...defaultSettings, ...settings },
    seed,
    now: 1_000_000,
  })
}

export function act(sim: Sim, actorId: string, action: ClientAction): void {
  const result = sim.act(actorId, action)
  if (!result.ok) throw new Error(`${actorId}: ${result.error}`)
}

/** Drops into the columns in order, red and blue alternating from whoever is to move. */
export function play(sim: Sim, columns: number[]): void {
  for (const column of columns) act(sim, sim.state.turn!, { type: 'drop', column })
}
