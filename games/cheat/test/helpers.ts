import type { Card, Rank, Suit } from '@ogn/core/kit'
import { createSim, type GameSim } from '@ogn/core/testing'
import { cheat, type CheatState, type CheatTimer, type PilePlay } from '../server/game.ts'
import { defaultSettings, type CheatSettings, type CheatView, type ClientAction } from '../shared/index.ts'

export type Sim = GameSim<CheatState, ClientAction, CheatTimer, CheatView, CheatSettings>

export const PLAYERS = ['p1', 'p2', 'p3']

interface Options {
  settings?: Partial<CheatSettings>
  players?: string[]
  seed?: number
}

export function newGame(options: Options = {}): Sim {
  return createSim(cheat, {
    players: (options.players ?? PLAYERS).map((id) => ({ id, name: id.toUpperCase() })),
    settings: { ...defaultSettings, ...options.settings },
    seed: options.seed ?? 1,
    now: 1_000_000,
  })
}

/** Cards from short codes: '7S', '10H', 'QD'. */
export function cards(...codes: string[]): Card[] {
  return codes.map((code) => ({ rank: code.slice(0, -1) as Rank, suit: code.slice(-1) as Suit }))
}

/**
 * Replace the deal: hands by seat (in seat order) and an optional pile of earlier plays
 * (`[seatIndex, codes, claim]`, oldest first, none open to a call). Whoever is first in
 * seat order gets the turn.
 */
export function setTable(sim: Sim, table: { hands: string[][]; pile?: Array<[number, string[], Rank]>; lastClaim?: Rank | null }): string[] {
  const seats = sim.state.seats
  const hands: Record<string, Card[]> = {}
  seats.forEach((id, i) => (hands[id] = cards(...(table.hands[i] ?? []))))
  const pile: PilePlay[] = (table.pile ?? []).map(([seat, codes, claim]) => ({ playerId: seats[seat]!, cards: cards(...codes), claim }))
  sim.state = {
    ...sim.state,
    hands,
    pile,
    open: false,
    lastClaim: table.lastClaim ?? pile.at(-1)?.claim ?? null,
    turn: seats[0]!,
    stage: 'play',
    callUntil: null,
    log: [],
  }
  return seats
}

/** A play action from short codes. */
export function playCodes(claim: Rank, ...codes: string[]): ClientAction {
  return { type: 'play', cards: cards(...codes), claim }
}

export function act(sim: Sim, actorId: string, action: ClientAction): void {
  const result = sim.act(actorId, action)
  if (!result.ok) throw new Error(`${actorId}: ${result.error}`)
}

/** Lets the call time after the latest play run out. */
export function waitOutCall(sim: Sim): void {
  sim.advance(sim.state.settings.callSeconds * 1000)
}
