import { createSim, type GameSim } from '@wsfg/core/testing'
import { lastCard, type LastCardState, type LastCardTimer } from '../server/game.ts'
import { cardSchema, defaultSettings, type ClientAction, type Color, type LastCardSettings, type LastCardView, type LcCard, type Value } from '../shared/index.ts'

export type Sim = GameSim<LastCardState, ClientAction, LastCardTimer, LastCardView, LastCardSettings>

export const PLAYERS = ['p1', 'p2', 'p3']

interface Options {
  settings?: Partial<LastCardSettings>
  players?: string[]
  seed?: number
}

export function newGame(options: Options = {}): Sim {
  return createSim(lastCard, {
    players: (options.players ?? PLAYERS).map((id) => ({ id, name: id.toUpperCase() })),
    settings: { ...defaultSettings, ...options.settings },
    seed: options.seed ?? 1,
    now: 1_000_000,
  })
}

const COLOR_CODES: Record<string, Color> = { r: 'red', y: 'yellow', g: 'green', b: 'blue' }
const VALUE_CODES: Record<string, Value> = { S: 'skip', R: 'reverse', '+2': 'draw2' }

/** A card from a short code: 'r5', 'gS' (skip), 'bR' (reverse), 'y+2', 'W' (wild), 'W+4'. */
export function card(code: string): LcCard {
  if (code === 'W') return { color: null, value: 'wild' }
  if (code === 'W+4') return { color: null, value: 'wild4' }
  const rest = code.slice(1)
  // Parsed, so a mistyped code fails loudly.
  return cardSchema.parse({ color: COLOR_CODES[code[0]!], value: VALUE_CODES[rest] ?? rest })
}

export const cards = (...codes: string[]): LcCard[] => codes.map(card)

/**
 * Replace the deal: hands by seat (in seat order), the draw pile (top first) and the top of
 * the discard pile (its colour in play unless `color` says otherwise). The first seat moves.
 */
export function setTable(sim: Sim, table: { hands: string[][]; pile?: string[]; top?: string; color?: Color; discard?: string[] }): string[] {
  const seats = sim.state.seats
  const hands: Record<string, LcCard[]> = {}
  seats.forEach((id, i) => (hands[id] = cards(...(table.hands[i] ?? []))))
  const top = card(table.top ?? 'r5')
  sim.state = {
    ...sim.state,
    hands,
    drawPile: cards(...(table.pile ?? [])),
    discard: [...cards(...(table.discard ?? [])), top],
    color: table.color ?? top.color!,
    turn: seats[0]!,
    stage: 'play',
    drawn: null,
    direction: 1,
    pendingDraw: 0,
    exposed: null,
    log: [],
  }
  return seats
}

export function act(sim: Sim, actorId: string, action: ClientAction): void {
  const result = sim.act(actorId, action)
  if (!result.ok) throw new Error(`${actorId}: ${result.error}`)
}

/** Plays a card by code, with extras for the play action. */
export function playCode(sim: Sim, actorId: string, code: string, extra: Omit<Extract<ClientAction, { type: 'play' }>, 'type' | 'card'> = {}): void {
  act(sim, actorId, { type: 'play', card: card(code), ...extra } as ClientAction)
}

export const codesOf = (hand: readonly LcCard[]): string[] =>
  hand.map((c) => {
    if (c.value === 'wild') return 'W'
    if (c.value === 'wild4') return 'W+4'
    const v = Object.entries(VALUE_CODES).find(([, value]) => value === c.value)?.[0] ?? c.value
    return c.color![0] + v
  })
