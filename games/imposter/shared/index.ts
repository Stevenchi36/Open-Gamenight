/**
 * Word Imposter types shared by the server module and the Vue client:
 * settings, client actions, and the per-player view.
 */
import type { GameMeta } from '@ogn/core/contract'
import { playerOrderSchema } from '@ogn/core/kit'
import { z } from 'zod'

type PlayerId = string

export const GAME_ID = 'imposter'
export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 12

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: 'Word Imposter',
  description: 'Everyone gets the secret word except the imposter. Give clues, find the faker.',
  styles: ['deduction', 'word', 'party'],
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
}
/** Fixed at 1 for now; kept as a constant so more can be supported later. */
export const IMPOSTER_COUNT = 1
/** How long the vote reveal stays up before moving on. */
export const REVEAL_MS = 5_000
export const CLUE_MAX_LENGTH = 24
/** Library words are under 30 chars; the slack leaves room for misspellings. */
export const GUESS_MAX_LENGTH = 40

// ---------------------------------------------------------------- settings

export const settingsSchema = z.object({
  rotations: z.number().int().min(1).max(5),
  playerOrder: playerOrderSchema,
  imposterHint: z.enum(['none', 'category', 'category+hint']),
  /**
   * 'custom' skips the seeded starter words (source 'builtin'), falling back to them when it runs out.
   * 'recent' plays the newest added batch first, then older words (core library.ts).
   */
  wordSource: z.enum(['all', 'custom', 'recent']),
  /** null = any category. */
  category: z.string().trim().min(1).max(40).nullable(),
  clueMode: z.enum(['typed', 'spoken']),
  guessMode: z.enum(['bonus', 'steal', 'off']),
  guessPoints: z.number().int().min(0).max(3),
  catchPoints: z.number().int().min(0).max(3),
  escapePoints: z.number().int().min(0).max(5),
  /** Seconds per turn; null = off. Typed: auto-skip on expiry. Spoken: visual only. */
  clueTimerSeconds: z.number().int().min(10).max(120).nullable(),
})

export type ImposterSettings = z.infer<typeof settingsSchema>

export const defaultSettings: ImposterSettings = {
  rotations: 2,
  playerOrder: 'rotate',
  imposterHint: 'category',
  wordSource: 'all',
  category: null,
  clueMode: 'typed',
  guessMode: 'bonus',
  guessPoints: 1,
  catchPoints: 1,
  escapePoints: 2,
  clueTimerSeconds: null,
}

// ---------------------------------------------------------------- actions

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit_clue'), word: z.string().max(100) }),
  z.object({ type: z.literal('end_turn') }),
  z.object({ type: z.literal('start_voting') }),
  z.object({ type: z.literal('cast_vote'), targetId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('end_voting') }),
  z.object({ type: z.literal('submit_guess'), word: z.string().max(100) }),
  z.object({ type: z.literal('judge_guess'), correct: z.boolean() }),
  z.object({ type: z.literal('skip_guess') }),
  /** shuffle: one-off reshuffle of the turn order ('rotate' then carries on from the new order). */
  z.object({ type: z.literal('next_round'), shuffle: z.boolean().optional() }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'CLUES' | 'VOTING' | 'REVEAL' | 'GUESS_CHECK' | 'RESULTS'

export interface Clue {
  playerId: PlayerId
  word: string
  rotation: number
}

export interface ResultView {
  /** Voter -> target. Secret during VOTING, public from REVEAL so the table can talk it over. */
  votedFor: Record<PlayerId, PlayerId>
  /** null on a tie or no votes. */
  accusedId: PlayerId | null
  caught: boolean
  imposterId: PlayerId
  judgeId: PlayerId | null
  guessRequired: boolean
  /** Typed mode: the imposter's guess once sent (always null in spoken mode). The judge still rules on it. */
  guess: string | null
  guessCorrect: boolean | null
  /** Omitted for the imposter until RESULTS. */
  secretWord?: string
  /** RESULTS only. */
  imposterWon?: boolean
  pointsAwarded?: Record<PlayerId, number>
  /** The imposter left mid-round: no points this round. */
  voided?: boolean
}

export interface ImposterView {
  phase: Phase
  round: number
  you: {
    /** 'waiting': joined mid-round, plays from the next round. */
    role: 'crew' | 'imposter' | 'waiting'
    /** null for the imposter (and while waiting). */
    word: string | null
    /** null for the imposter when imposterHint is 'none'. */
    category: string | null
    /** Imposter only, when imposterHint is 'category+hint'. */
    hint: string | null
    /** Your current vote during VOTING (yours only). */
    vote: PlayerId | null
  }
  /** Players taking part in this round, in join order. */
  roundPlayers: PlayerId[]
  scores: Record<PlayerId, number>
  turn: {
    order: PlayerId[]
    currentPlayerId: PlayerId | null
    rotation: number
    totalRotations: number
    /** ms since epoch, when a clue timer is running. */
    deadline: number | null
  }
  /** Always [] in spoken mode. */
  clues: Clue[]
  /** Who has voted, not for whom. */
  voted: PlayerId[]
  /** REVEAL / GUESS_CHECK / RESULTS only. */
  result?: ResultView
}
