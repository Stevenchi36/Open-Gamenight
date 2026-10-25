/**
 * Ballpark types shared by the server module and the Vue client:
 * settings, client actions, and the per-player view.
 */
import type { GameMeta } from '@wsfg/core/contract'
import { z } from 'zod'
import { UNIT_SYSTEMS } from './units.ts'

type PlayerId = string

export const GAME_ID = 'ballpark'
export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 12

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: 'Ballpark',
  description: 'Everyone guesses a number for a trivia question, then bets on whose guess is closest. Knowing nothing is fine if you bet well.',
  styles: ['trivia', 'party'],
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
}

/** Guesses and answers stay within ±1e12. */
export const MAX_MAGNITUDE = 1e12
export const QUESTION_MIN_LENGTH = 5
export const QUESTION_MAX_LENGTH = 160
export const FACT_MAX_LENGTH = 200

/** Betting tokens each player places per round. */
export const TOKENS = 2
/** Points for writing a winning guess (odds and chips scoring; flat scores 1). */
export const GUESS_BONUS = 3
/** What a token on All too high pays (odds and chips scoring). */
export const TOO_HIGH_ODDS = 6
/** The slot id of All too high. */
export const TOO_HIGH = 'too_high'

export const ROUND_COUNTS = [5, 7, 10, 15] as const
export const TIMERS = [30, 45, 60, 90, 120] as const

// ---------------------------------------------------------------- settings

export const winRuleSchema = z.enum(['over', 'closest'])
export type WinRule = z.infer<typeof winRuleSchema>
export const scoringSchema = z.enum(['odds', 'chips', 'flat'])
export type Scoring = z.infer<typeof scoringSchema>
export const betVisibilitySchema = z.enum(['hidden', 'public'])
export type BetVisibility = z.infer<typeof betVisibilitySchema>

export const settingsSchema = z.object({
  /** Rounds in a game; null = unlimited (play until the host stops). */
  rounds: z.number().int().min(1).max(50).nullable(),
  units: z.enum(UNIT_SYSTEMS),
  /** over: the highest guess not above the answer (or All too high). closest: the nearest guess. */
  winRule: winRuleSchema,
  /** odds: tokens pay the slot's odds. chips: tokens may carry stakes from your score. flat: 1 point a token. */
  scoring: scoringSchema,
  /** hidden: only who has bet is shown until the reveal. */
  bets: betVisibilitySchema,
  /** 'recent' plays the newest added batch first, then older questions (core library.ts). */
  questionSource: z.enum(['all', 'recent']),
  /** null = any category. */
  category: z.string().trim().min(1).max(40).nullable(),
  /** Seconds for guessing, and again for betting; null = off. On expiry the game moves on with what's in. */
  timerSeconds: z.number().int().min(10).max(300).nullable(),
})

export type BallparkSettings = z.infer<typeof settingsSchema>

export const defaultSettings: BallparkSettings = {
  rounds: 7,
  units: 'metric',
  winRule: 'over',
  scoring: 'odds',
  bets: 'hidden',
  questionSource: 'all',
  category: null,
  timerSeconds: null,
}

// ---------------------------------------------------------------- actions

const betSchema = z.object({ slot: z.string().max(20), stake: z.number().int().min(0).max(1_000_000) })
export type Bet = z.infer<typeof betSchema>

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit_guess'), value: z.number() }),
  z.object({ type: z.literal('reveal_guesses') }),
  z.object({ type: z.literal('place_bets'), bets: z.array(betSchema).length(TOKENS) }),
  z.object({ type: z.literal('reveal_answer') }),
  z.object({ type: z.literal('next_round') }),
  z.object({ type: z.literal('new_game') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'GUESSING' | 'BETTING' | 'RESULTS'

export interface Slot {
  /** `g0`, `g1`, ... lowest guess first, or TOO_HIGH. */
  id: string
  /** null for All too high. */
  value: number | null
  /** Who guessed this value. */
  playerIds: PlayerId[]
  /** Points one token on this slot wins (before any stake). */
  odds: number
}

export interface RoundResult {
  /** In the room's units, as rounded for play. */
  answer: number
  fact: string | null
  winningSlotIds: string[]
  /** Every round player; negative when chips scoring lost stakes. */
  pointsAwarded: Record<PlayerId, number>
  /** Non-empty after the last round: the game is over. */
  winnerIds: PlayerId[]
}

export interface BallparkView {
  phase: Phase
  round: number
  totalRounds: number | null
  /** `unit` is the label in the room's system ("feet"), or null for plain numbers. */
  question: { text: string; category: string; unit: string | null }
  you: {
    /** 'waiting': joined mid-round, plays from the next round. */
    status: 'playing' | 'waiting'
    /** Your own guess and bets only. */
    guess: number | null
    bets: Bet[]
  }
  /** Players taking part in this round, in join order. */
  roundPlayers: PlayerId[]
  /** Who has guessed and who has bet, not what. */
  guessed: PlayerId[]
  betted: PlayerId[]
  /** ms since epoch, while the guess or bet timer runs. */
  deadline: number | null
  /** Empty while guessing; lowest first, All too high (when it applies) first of all. */
  slots: Slot[]
  /** Everyone's bets: while betting with public bets, and in RESULTS. Otherwise null. */
  bets: Record<PlayerId, Bet[]> | null
  scores: Record<PlayerId, number>
  /** RESULTS only. */
  result: RoundResult | null
}

export type { UnitCode, UnitSystem } from './units.ts'
