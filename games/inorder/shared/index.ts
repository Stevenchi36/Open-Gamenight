/**
 * In Order types shared by the server module and the Vue client:
 * settings, client actions, and the per-player view.
 */
import type { GameMeta } from '@ogn/core/contract'
import { z } from 'zod'

type PlayerId = string

export const GAME_ID = 'inorder'
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 12

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: 'In Order',
  description: 'Everyone gets a secret number from 1 to 100 and describes it to fit a theme. Then the whole team works together to put the clues in order.',
  styles: ['party', 'word'],
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
}

/** Numbers are dealt from 1 to MAX_NUMBER, all different. */
export const MAX_NUMBER = 100
export const CLUE_MAX_LENGTH = 40
export const THEME_MIN_LENGTH = 5
export const THEME_MAX_LENGTH = 80
export const END_MAX_LENGTH = 30

export const ROUND_OPTIONS = [3, 5, 7, 10] as const
export const MAX_LIVES = 5
export const MAX_NUMBERS_EACH = 3

// ---------------------------------------------------------------- settings

export const settingsSchema = z.object({
  /** Rounds to win; null = play until the lives run out. */
  rounds: z.number().int().min(1).max(20).nullable(),
  /** Shared by the team; 1 lost per mistake. */
  lives: z.number().int().min(1).max(MAX_LIVES),
  /** Secret numbers per player each round. */
  numbersEach: z.number().int().min(1).max(MAX_NUMBERS_EACH),
  /** 'recent' plays the newest added batch first, then older themes (core library.ts). */
  themeSource: z.enum(['all', 'recent']),
  /** null = any category. */
  category: z.string().trim().min(1).max(40).nullable(),
})

export type InOrderSettings = z.infer<typeof settingsSchema>

export const defaultSettings: InOrderSettings = {
  rounds: 5,
  lives: 3,
  numbersEach: 1,
  themeSource: 'all',
  category: null,
}

// ---------------------------------------------------------------- actions

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('submit_clue'), itemId: z.string().max(200), text: z.string().max(200) }),
  z.object({ type: z.literal('move_item'), itemId: z.string().max(200), to: z.number().int().min(0).max(1000) }),
  z.object({ type: z.literal('set_ready'), ready: z.boolean() }),
  z.object({ type: z.literal('reveal_now') }),
  z.object({ type: z.literal('next_round') }),
  z.object({ type: z.literal('new_game') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'ORDERING' | 'RESULTS'
export type Outcome = 'won' | 'lost'

export interface Theme {
  text: string
  /** The scale's ends: what 1 and 100 mean. */
  low: string
  high: string
  category: string
}

/** One card in the shared line. */
export interface LineItem {
  /** `<playerId>#<k>`, k in deal order. */
  id: string
  playerId: PlayerId
  clue: string | null
  /** RESULTS only. */
  number: number | null
}

export interface RoundResult {
  /** Mistakes this round: the fewest cards that would have to move to put the line right. */
  livesLost: number
  /** The cards counted as mistakes. */
  wrong: string[]
  /** null: the game carries on. */
  outcome: Outcome | null
}

export interface InOrderView {
  phase: Phase
  round: number
  /** null: until the lives run out. */
  totalRounds: number | null
  lives: number
  maxLives: number
  /** Rounds finished with lives left. */
  cleared: number
  /** Rounds with no mistakes. */
  perfect: number
  theme: Theme
  you: {
    /** 'waiting': joined mid-round, plays from the next round. */
    status: 'playing' | 'waiting'
    /** Your own cards, lowest number first. */
    cards: { id: string; number: number; clue: string | null }[]
  }
  /** Players taking part in this round, in join order. */
  roundPlayers: PlayerId[]
  /** The shared line, lowest first as the table has placed it. */
  line: LineItem[]
  /** Round players happy with the line. */
  ready: PlayerId[]
  /** RESULTS only. */
  result: RoundResult | null
}
