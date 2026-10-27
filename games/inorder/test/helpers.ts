import { createSim, type GameSim } from '@ogn/core/testing'
import { inOrder, type InOrderState, type PreparedTheme } from '../server/game.ts'
import { defaultSettings, type ClientAction, type InOrderSettings, type InOrderView } from '../shared/index.ts'

export type Sim = GameSim<InOrderState, ClientAction, never, InOrderView, InOrderSettings, PreparedTheme>

export const PLAYERS = ['p1', 'p2', 'p3', 'p4']
export const THEME: PreparedTheme = { id: 7, category: 'Everyday Life', text: 'How scary is it?', low: 'Not scary at all', high: 'Terrifying' }

interface Options {
  settings?: Partial<InOrderSettings>
  players?: string[]
  /** null: no prepareRound output, so the starter list is used. */
  prepare?: PreparedTheme | null
  seed?: number
}

export function newGame(options: Options = {}): Sim {
  const prepared = options.prepare === undefined ? THEME : options.prepare
  return createSim(inOrder, {
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

/** Every card gets a clue from its owner. */
export function clueAll(sim: Sim): void {
  for (const card of Object.values(sim.state.cards)) act(sim, card.playerId, { type: 'submit_clue', itemId: card.id, text: `clue ${card.id}` })
}

/** Set the line to these card ids, top first, by moving each into place. */
export function arrange(sim: Sim, ids: string[]): void {
  ids.forEach((itemId, to) => act(sim, sim.state.roundPlayers[0]!, { type: 'move_item', itemId, to }))
}

/** Card ids ordered by number, lowest first: the right answer. */
export function sorted(sim: Sim): string[] {
  return Object.values(sim.state.cards)
    .sort((a, b) => a.number - b.number)
    .map((c) => c.id)
}

/** Every listed player taps Ready. */
export function readyAll(sim: Sim, ids = sim.state.roundPlayers): void {
  for (const id of ids) act(sim, id, { type: 'set_ready', ready: true })
}
