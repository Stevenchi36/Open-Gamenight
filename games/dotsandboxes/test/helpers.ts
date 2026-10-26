import { createSim, type GameSim } from '@wsfg/core/testing'
import { dotsAndBoxes, type DotsState, type DotsTimer } from '../server/game.ts'
import { defaultSettings, type ClientAction, type Dir, type DotsSettings, type DotsView, type Line } from '../shared/index.ts'

export type Sim = GameSim<DotsState, ClientAction, DotsTimer, DotsView, DotsSettings>

export const PLAYERS = ['p1', 'p2']

export function newGame(settings: Partial<DotsSettings> = {}, players = PLAYERS, seed = 1): Sim {
  return createSim(dotsAndBoxes, {
    players: players.map((id) => ({ id, name: id.toUpperCase() })),
    settings: { ...defaultSettings, ...settings },
    seed,
    now: 1_000_000,
  })
}

export function act(sim: Sim, actorId: string, action: ClientAction): void {
  const result = sim.act(actorId, action)
  if (!result.ok) throw new Error(`${actorId}: ${result.error}`)
}

/** 'h0,1' is the across-line from the dot in row 0, column 1. */
export function line(spec: string): Line {
  const [row, col] = spec.slice(1).split(',').map(Number)
  return { dir: spec[0] as Dir, row: row!, col: col! }
}

/** Draws the lines in order, each by whoever is to move. */
export function play(sim: Sim, specs: string[]): void {
  for (const spec of specs) act(sim, sim.state.turn!, { type: 'draw', ...line(spec) })
}

/** Every line on the board except `skip`, as specs. */
export function allLines(grid: number, skip: string[] = []): string[] {
  const specs: string[] = []
  for (let row = 0; row <= grid; row++) for (let col = 0; col < grid; col++) specs.push(`h${row},${col}`)
  for (let row = 0; row < grid; row++) for (let col = 0; col <= grid; col++) specs.push(`v${row},${col}`)
  return specs.filter((s) => !skip.includes(s))
}
