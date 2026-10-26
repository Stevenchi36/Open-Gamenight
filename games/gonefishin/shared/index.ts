/**
 * Gone Fishin' types shared by the server module and the Vue client:
 * settings, client actions and the per-player view.
 */
import type { GameMeta } from '@wsfg/core/contract'
import { moveHistorySchema, rankSchema, type Card, type MoveHistory, type Rank } from '@wsfg/core/kit'
import { z } from 'zod'

type PlayerId = string

export const GAME_ID = 'gonefishin'
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: "Gone Fishin'",
  description: 'Ask around the table for cards and collect books of four.',
  styles: ['card'],
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
}

/** One book per rank, so a game ends at 13. */
export const TOTAL_BOOKS = 13

/** Cards dealt to each player: 7 with 2-3 players, 5 with more. */
export function handSize(players: number): number {
  return players <= 3 ? 7 : 5
}

// ---------------------------------------------------------------- settings

export const settingsSchema = z.object({
  /** Drawing the asked-for rank from the pond lets you ask again. */
  luckyCatch: z.boolean(),
  /** How many past asks players can look back at; remembering them is the skill. */
  moveHistory: moveHistorySchema,
})

export type GoneFishinSettings = z.infer<typeof settingsSchema>

export const defaultSettings: GoneFishinSettings = {
  luckyCatch: true,
  moveHistory: 'last5',
}

// ---------------------------------------------------------------- actions

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ask'), targetId: z.string().min(1).max(64), rank: rankSchema }),
  z.object({ type: z.literal('new_game') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'PLAYING' | 'RESULTS'

/** One move as the table saw and heard it. Everything here is public. */
export interface Move {
  askerId: PlayerId
  /** null: nobody else held cards, so the asker drew instead of asking. */
  targetId: PlayerId | null
  rank: Rank | null
  /** Cards handed over; 0 = gone fishin'. */
  given: number
  /** A card came from the pond (false when it was empty). */
  drew: boolean
  /** Drew the asked rank and showed it (Lucky catch on). */
  lucky: boolean
  /** Books laid down as a result. */
  books: Rank[]
}

export interface Seat {
  id: PlayerId
  /** Cards in hand. */
  cards: number
  books: Rank[]
  /** Left mid-game; their books stay down. */
  left: boolean
}

export interface GoneFishinView {
  phase: Phase
  game: number
  luckyCatch: boolean
  moveHistory: MoveHistory
  you: {
    /** 'waiting': joined mid-game, plays from the next game. */
    status: 'playing' | 'waiting'
    /** Your own cards, sorted by rank; [] when not playing. */
    hand: Card[]
  }
  /** This game's players in seat order (turns go this way, clockwise). */
  seats: Seat[]
  /** Cards left in the pond. */
  pond: number
  /** Who asks next; null outside PLAYING. */
  turn: PlayerId | null
  /** This game's moves, oldest first, trimmed to `moveHistory`: always the latest one, so only empty before the first move. */
  log: Move[]
  /** Moves before `log[0]`, so `logStart + log.length` is the move count. */
  logStart: number
  /** RESULTS only. */
  outcome: 'win' | 'abandoned' | null
  winnerIds: PlayerId[]
  scores: Record<PlayerId, number>
}
