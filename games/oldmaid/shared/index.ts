/**
 * Old Maid types shared by the server module and the Vue client:
 * settings, client actions and the per-player view.
 */
import type { GameMeta } from '@ogn/core/contract'
import type { Card, Suit } from '@ogn/core/kit'
import { z } from 'zod'

type PlayerId = string

export const GAME_ID = 'oldmaid'
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 10

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: 'Old Maid',
  description: "Pair up your cards and pass them round. Don't get stuck with the odd queen.",
  styles: ['card'],
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
}

/** Taken out of the deck, so one queen is left without a partner. */
export const REMOVED_CARD: Card = { rank: 'Q', suit: 'C' }

const RED: readonly Suit[] = ['H', 'D']

/** What two cards must share to pair: the rank, and with Match colour the colour too. */
export function pairKey(card: Card, matchColour: boolean): string {
  return matchColour ? `${card.rank}${RED.includes(card.suit) ? 'r' : 'b'}` : card.rank
}

// ---------------------------------------------------------------- settings

export const formatSchema = z.enum(['classic', 'royale'])
export type Format = z.infer<typeof formatSchema>

export const settingsSchema = z.object({
  /** classic: every round is a game, all but the Old Maid score 1. royale: the Old Maid is eliminated each round. */
  format: formatSchema,
  /** Pairs need the same colour as well as the same rank. */
  matchColour: z.boolean(),
  /** Players can move single cards in their own hand (anyone can shuffle theirs). The next player draws from the hand in its order, which only its owner sees. */
  arrange: z.boolean(),
})

export type OldMaidSettings = z.infer<typeof settingsSchema>

export const defaultSettings: OldMaidSettings = {
  format: 'classic',
  matchColour: false,
  arrange: false,
}

// ---------------------------------------------------------------- actions

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('draw'), index: z.number().int().min(0).max(60) }),
  z.object({ type: z.literal('arrange'), order: z.array(z.number().int().min(0).max(60)).max(60) }),
  z.object({ type: z.literal('shuffle') }),
  z.object({ type: z.literal('next_round') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'PLAYING' | 'RESULTS'

/** One draw as the table saw it. Public, except `card`. */
export interface Move {
  drawerId: PlayerId
  fromId: PlayerId
  /** The place picked in fromId's hand. */
  index: number
  /** The card taken: only the drawer and the giver see it, unless it made a pair. */
  card: Card | null
  /** The pair it made, thrown face up. */
  pair: [Card, Card] | null
  /** Players whose hand emptied with this draw (safe). */
  out: PlayerId[]
  /** Drawn for a disconnected player. */
  away: boolean
}

export interface Seat {
  id: PlayerId
  /** Cards in hand. */
  cards: number
  /** Pairs thrown this round. */
  pairs: number
  /** 1 for the first player out this round; null while holding cards. */
  outPlace: number | null
  /** Dealt in this round (Royale: not eliminated). */
  inRound: boolean
  /** Royale: caught as the Old Maid in an earlier round. */
  eliminated: boolean
  /** Left mid-game. */
  left: boolean
}

export type YouStatus = 'playing' | 'out' | 'eliminated' | 'waiting'

export interface OldMaidView {
  phase: Phase
  /** Classic: rounds played; Royale: Royales started. */
  game: number
  /** Royale: this Royale's round, from 1. Always 1 in Classic. */
  round: number
  settings: OldMaidSettings
  you: {
    /** 'out': no cards left this round. 'waiting': not dealt in; plays from the next game. */
    status: YouStatus
    /** Your own cards, in the order the next player draws from (dealt and received cards land at random). */
    hand: Card[]
  }
  /** Everyone at the table in seat order (turns go this way, clockwise). */
  seats: Seat[]
  /** Pairs thrown this round, oldest first. */
  discard: [Card, Card][]
  /** Who draws next, and from whom; null outside PLAYING. */
  turn: PlayerId | null
  from: PlayerId | null
  /** This round's draws, oldest first. */
  log: Move[]
  /** RESULTS only. */
  outcome: 'maid' | 'abandoned' | null
  maidId: PlayerId | null
  maidCard: Card | null
  /** Royale: the last player in, once the Royale is won. */
  royaleWinnerId: PlayerId | null
  /** Royale: the next round continues this Royale (rather than starting a new one). */
  royaleGoesOn: boolean
  scores: Record<PlayerId, number>
}
