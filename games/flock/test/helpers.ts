import { createSim, type GameSim } from '@wsfg/core/testing'
import { flock, type FlockState, type FlockTimer, type PreparedQuestion } from '../server/game.ts'
import { defaultSettings, type ClientAction, type FlockSettings, type FlockView } from '../shared/index.ts'

export type Sim = GameSim<FlockState, ClientAction, FlockTimer, FlockView, FlockSettings, PreparedQuestion>

export const PLAYERS = ['p1', 'p2', 'p3', 'p4']
export const QUESTION: PreparedQuestion = { id: 7, category: 'Food & Drink', text: 'Name a breakfast cereal' }

interface Options {
  settings?: Partial<FlockSettings>
  players?: string[]
  /** null: no prepareRound output, so the starter list is used. */
  prepare?: PreparedQuestion | null
  seed?: number
}

export function newGame(options: Options = {}): Sim {
  const prepared = options.prepare === undefined ? QUESTION : options.prepare
  return createSim(flock, {
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
