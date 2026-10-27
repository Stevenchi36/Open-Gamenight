import { createSim, type GameSim } from '@ogn/core/testing'
import { colorMix, type ColorMixState, type ColorMixTimer } from '../server/game.ts'
import { defaultSettings, type ClientAction, type ColorMixSettings, type ColorMixView } from '../shared/index.ts'

export type Sim = GameSim<ColorMixState, ClientAction, ColorMixTimer, ColorMixView, ColorMixSettings>

export const PLAYERS = ['p1', 'p2', 'p3', 'p4']

interface Options {
  settings?: Partial<ColorMixSettings>
  players?: string[]
  seed?: number
}

export function newGame(options: Options = {}): Sim {
  return createSim(colorMix, {
    players: (options.players ?? PLAYERS).map((id) => ({ id, name: id.toUpperCase() })),
    settings: { ...defaultSettings, ...options.settings },
    seed: options.seed ?? 1,
    now: 1_000_000,
  })
}

export function act(sim: Sim, actorId: string, action: ClientAction): void {
  const result = sim.act(actorId, action)
  if (!result.ok) throw new Error(`${actorId}: ${result.error}`)
}

/** Each listed player guesses (in order). */
export function guessAll(sim: Sim, guesses: Record<string, string>): void {
  for (const [id, color] of Object.entries(guesses)) act(sim, id, { type: 'submit_guess', color })
}
