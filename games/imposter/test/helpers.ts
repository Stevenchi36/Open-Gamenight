import { createSim, type GameSim } from '@wsfg/core/testing'
import { imposter, type ImposterAction, type ImposterState, type PreparedWord } from '../server/game.ts'
import { defaultSettings, type ImposterSettings, type ImposterView } from '../shared/index.ts'

export type Sim = GameSim<ImposterState, ImposterAction, ImposterView, ImposterSettings, PreparedWord>

export const PLAYERS = ['p1', 'p2', 'p3', 'p4']
export const WORD: PreparedWord = { id: 7, category: 'Animals', word: 'Penguin', hint: 'Dressed for dinner' }

interface Options {
  settings?: Partial<ImposterSettings>
  players?: string[]
  /** Search seeds until this player is the imposter. */
  imposter?: string
  hostId?: string
  prepare?: PreparedWord | null
  seed?: number
}

export function newGame(options: Options = {}): Sim {
  const players = (options.players ?? PLAYERS).map((id) => ({ id, name: id.toUpperCase() }))
  const settings = { ...defaultSettings, ...options.settings }
  const prepared = options.prepare === undefined ? WORD : options.prepare
  for (let seed = options.seed ?? 1; seed < 1000; seed++) {
    const sim = createSim(imposter, {
      players,
      settings,
      seed,
      now: 1_000_000,
      ...(options.hostId ? { hostId: options.hostId } : {}),
      ...(prepared ? { prepare: () => prepared } : {}),
    })
    if (!options.imposter || sim.state.imposterId === options.imposter) return sim
  }
  throw new Error('no seed found')
}

export const current = (sim: Sim) => sim.view(sim.players[0]!.id).turn.currentPlayerId

export const crewOf = (sim: Sim) => sim.state.roundPlayers.filter((id) => id !== sim.state.imposterId)

/** Typed mode: everyone submits a unique clue until voting starts. */
export function playClues(sim: Sim): void {
  let n = 0
  while (sim.state.phase === 'CLUES') {
    const id = current(sim)!
    const result = sim.act(id, { type: 'submit_clue', word: `clue${n++}` })
    if (!result.ok) throw new Error(result.error)
  }
}

/** Spoken mode: everyone taps Done until voting starts. */
export function playSpoken(sim: Sim): void {
  while (sim.state.phase === 'CLUES') {
    const result = sim.act(current(sim)!, { type: 'end_turn' })
    if (!result.ok) throw new Error(result.error)
  }
}

/** Every connected round player votes for target(voter). */
export function voteAll(sim: Sim, target: (voter: string) => string): void {
  for (const p of sim.players) {
    if (!p.connected || !sim.state.roundPlayers.includes(p.id) || sim.state.phase !== 'VOTING') continue
    const result = sim.act(p.id, { type: 'cast_vote', targetId: target(p.id) })
    if (!result.ok) throw new Error(`${p.id}: ${result.error}`)
  }
}

/** Vote so the imposter is caught (crew votes imposter; imposter votes some crew member). */
export function catchImposter(sim: Sim): void {
  const imp = sim.state.imposterId
  voteAll(sim, (voter) => (voter === imp ? crewOf(sim)[0]! : imp))
}

/** Vote so a crew member is accused (everyone votes crew[0]; crew[0] votes crew[1]). */
export function frameCrew(sim: Sim): void {
  const [a, b] = crewOf(sim)
  voteAll(sim, (voter) => (voter === a ? b! : a!))
}

export function toGuessCheckOrResults(sim: Sim): void {
  sim.advance(5_000)
}
