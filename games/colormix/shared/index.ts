/**
 * Color Mix types shared by the server module and the Vue client:
 * settings, client actions, and the per-player view.
 */
import type { GameMeta } from '@wsfg/core/contract'
import { z } from 'zod'

type PlayerId = string

export const GAME_ID = 'colormix'
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 12

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: 'Color Mix',
  description: 'A few paint colours appear. Pick the colour they make when mixed: the closest guess scores.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
}

export const MIN_COLORS = 2
export const MAX_COLORS = 6
export const ROUND_COUNTS = [5, 10, 15, 20] as const
export const GUESS_TIMERS = [30, 45, 60, 90, 120] as const

/** Lower-case `#rrggbb`; the action accepts any case. */
export const HEX_COLOR = /^#[0-9a-f]{6}$/i

// ---------------------------------------------------------------- settings

export const scoringSchema = z.enum(['ranked', 'closest'])
export type Scoring = z.infer<typeof scoringSchema>

export const settingsSchema = z.object({
  /** Rounds in a game; null = unlimited (play until the host stops). */
  rounds: z.number().int().min(1).max(50).nullable(),
  /** Colours to mix each round, or 'random' (a new count from 2-6 each round). */
  colorCount: z.union([z.number().int().min(MIN_COLORS).max(MAX_COLORS), z.literal('random')]),
  /** ranked: 1 point per player you beat. closest: 1 point for the closest guess. */
  scoring: scoringSchema,
  /** Seconds to guess; null = off. On expiry the guesses in so far are revealed. */
  guessTimerSeconds: z.number().int().min(10).max(300).nullable(),
})

export type ColorMixSettings = z.infer<typeof settingsSchema>

export const defaultSettings: ColorMixSettings = {
  rounds: null,
  colorCount: 2,
  scoring: 'ranked',
  guessTimerSeconds: null,
}

// ---------------------------------------------------------------- actions

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit_guess'), color: z.string().max(20) }),
  z.object({ type: z.literal('reveal_guesses') }),
  z.object({ type: z.literal('next_round') }),
  z.object({ type: z.literal('new_game') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'GUESSING' | 'RESULTS'

export interface ScoredGuess {
  playerId: PlayerId
  color: string
  /** OKLab distance from the answer: 0 is exact. */
  distance: number
  /** 0-100, for display. */
  closeness: number
  points: number
}

export interface RoundResult {
  /** Closest first; players who didn't guess are left out. */
  guesses: ScoredGuess[]
  /** Every round player, 0 for those who scored nothing. */
  pointsAwarded: Record<PlayerId, number>
  /** Non-empty after the last round: the game is over. */
  winnerIds: PlayerId[]
}

export interface ColorMixView {
  phase: Phase
  round: number
  /** null: unlimited rounds. */
  totalRounds: number | null
  /** The colours to mix, `#rrggbb`. */
  colors: string[]
  you: {
    /** 'waiting': joined mid-round, plays from the next round. */
    status: 'playing' | 'waiting'
    /** Your own guess this round, if sent. */
    guess: string | null
  }
  /** Players taking part in this round, in join order. */
  roundPlayers: PlayerId[]
  /** Who has guessed, not what. */
  guessed: PlayerId[]
  /** ms since epoch, while the guess timer runs. */
  deadline: number | null
  scores: Record<PlayerId, number>
  /** The mixed colour; RESULTS only. */
  target: string | null
  /** RESULTS only. */
  result: RoundResult | null
}
