/**
 * Flock types shared by the server module and the Vue client:
 * settings, client actions, and the per-player view.
 */
import type { GameMeta } from '@ogn/core/contract'
import { z } from 'zod'

type PlayerId = string

export const GAME_ID = 'flock'
export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 12

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: 'Flock',
  description: 'Everyone answers the same question. Think like the flock: you score when you match the most popular answer.',
  styles: ['party', 'word'],
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
}

export const ANSWER_MAX_LENGTH = 40
export const QUESTION_MIN_LENGTH = 5
export const QUESTION_MAX_LENGTH = 120

export const SCORE_LIMITS = [5, 8, 10, 12, 15, 20] as const
export const ANSWER_TIMERS = [30, 45, 60, 90, 120] as const

// ---------------------------------------------------------------- settings

export const settingsSchema = z.object({
  /** Points to win; null = unlimited (play until the host stops). */
  scoreLimit: z.number().int().min(1).max(50).nullable(),
  /** The lone odd one out becomes the black sheep, who can't win. */
  blackSheep: z.boolean(),
  /** The host merges near-miss answers before scoring. */
  checkMatches: z.boolean(),
  /** 'recent' plays the newest added batch first, then older questions (core library.ts). */
  questionSource: z.enum(['all', 'recent']),
  /** null = any category. */
  category: z.string().trim().min(1).max(40).nullable(),
  /** Seconds to answer; null = off. On expiry the answers in so far are revealed. */
  answerTimerSeconds: z.number().int().min(10).max(300).nullable(),
})

export type FlockSettings = z.infer<typeof settingsSchema>

export const defaultSettings: FlockSettings = {
  scoreLimit: null,
  blackSheep: true,
  checkMatches: true,
  questionSource: 'all',
  category: null,
  answerTimerSeconds: null,
}

// ---------------------------------------------------------------- actions

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit_answer'), text: z.string().max(200) }),
  z.object({ type: z.literal('reveal_answers') }),
  z.object({ type: z.literal('merge_groups'), from: z.string().max(200), into: z.string().max(200) }),
  z.object({ type: z.literal('split_group'), group: z.string().max(200) }),
  z.object({ type: z.literal('score_round') }),
  z.object({ type: z.literal('next_round') }),
  z.object({ type: z.literal('new_game') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'ANSWERING' | 'REVIEW' | 'RESULTS'

export interface AnswerGroup {
  /** Stable id for merge/split: the normalised answer it started from. */
  id: string
  /** The most common spelling in the group. */
  label: string
  /** The host merged differently-matched answers into it (it can be split again). */
  merged: boolean
  answers: { playerId: PlayerId; text: string }[]
}

export interface RoundResult {
  /** Every round player, 0 for those outside the flock. */
  pointsAwarded: Record<PlayerId, number>
  /** Who held the black sheep before this round and who holds it now (equal when it didn't move). */
  blackSheepFrom: PlayerId | null
  blackSheepTo: PlayerId | null
  /** Non-empty when the score limit was reached: the game is over. */
  winnerIds: PlayerId[]
}

export interface FlockView {
  phase: Phase
  round: number
  question: { text: string; category: string }
  you: {
    /** 'waiting': joined mid-round, plays from the next round. */
    status: 'playing' | 'waiting'
    /** Your own answer this round, if sent. */
    answer: string | null
  }
  /** Players taking part in this round, in join order. */
  roundPlayers: PlayerId[]
  /** Who has answered, not what. */
  answered: PlayerId[]
  /** ms since epoch, while the answer timer runs. */
  deadline: number | null
  scores: Record<PlayerId, number>
  blackSheepId: PlayerId | null
  /** Empty while answering; biggest group first from REVIEW on. */
  groups: AnswerGroup[]
  /** The flock's group id (REVIEW: as things stand), or null on a tie. */
  flockId: string | null
  /** RESULTS only. */
  result: RoundResult | null
}
