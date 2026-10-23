import { createSim, type GameSim } from '@wsfg/core/testing'
import { herd, type HerdState, type HerdTimer, type PreparedQuestion } from '../server/game.ts'
import { defaultSettings, type ClientAction, type HerdSettings, type HerdView } from '../shared/index.ts'

export type Sim = GameSim<HerdState, ClientAction, HerdTimer, HerdView, HerdSettings, PreparedQuestion>

export const PLAYERS = ['p1', 'p2', 'p3', 'p4']
export const QUESTION: PreparedQuestion = { id: 7, category: 'Food & Drink', text: 'Name a breakfast cereal' }

interface Options {
  settings?: Partial<HerdSettings>
  players?: string[]
  /** null: no prepareRound output, so the starter list is used. */
  prepare?: PreparedQuestion | null
  seed?: number
}

export function newGame(options: Options = {}): Sim {
  const prepared = options.prepare === undefined ? QUESTION : options.prepare
  return createSim(herd, {
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

/** Each listed player answers (in order). */
export function answerAll(sim: Sim, answers: Record<string, string>): void {
  for (const [id, text] of Object.entries(answers)) act(sim, id, { type: 'submit_answer', text })
}

/** Group id holding this player's answer. */
export function groupWith(sim: Sim, playerId: string): string {
  return sim.view(playerId).groups.find((g) => g.answers.some((a) => a.playerId === playerId))!.id
}
