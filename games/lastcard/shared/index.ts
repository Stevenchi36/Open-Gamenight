/**
 * Last Card types shared by the server module and the Vue client:
 * settings, client actions and the per-player view.
 */
import type { GameMeta } from '@ogn/core/contract'
import { z } from 'zod'
import { cardSchema, colorSchema, type Color, type LcCard } from './cards.ts'

export * from './cards.ts'

type PlayerId = string

export const GAME_ID = 'lastcard'
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 10

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: 'Last Card',
  description: 'Match the colour or number, dodge the draw cards, and be first to empty your hand.',
  styles: ['card'],
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
}

export const HAND_SIZE = 7
/** What a player who didn't call "Last card!" draws when caught. */
export const CATCH_PENALTY = 2

// ---------------------------------------------------------------- settings

export const TARGETS = [100, 200, 300, 500] as const

export const scoringSchema = z.enum(['points', 'rounds'])
export type Scoring = z.infer<typeof scoringSchema>
export const lastCallSchema = z.enum(['call', 'auto'])
export type LastCall = z.infer<typeof lastCallSchema>

export const settingsSchema = z.object({
  /** 'points': the winner scores the cards left in other hands, first to `target` wins the game. 'rounds': 1 per round won. */
  scoring: scoringSchema,
  target: z.literal(TARGETS),
  /** 'call': press Last card! or be caught for 2. 'auto': called for you. */
  lastCall: lastCallSchema,
  /** Answer a draw card with another to pass the growing total on. */
  stacking: z.boolean(),
  /** Keep drawing until you draw a card you can play. */
  drawUntilPlayable: z.boolean(),
  /** A 7 swaps hands with a chosen player; a 0 passes every hand on. */
  sevenZero: z.boolean(),
  /** Play a card identical to the top card out of turn. */
  jumpIn: z.boolean(),
})

export type LastCardSettings = z.infer<typeof settingsSchema>

export const defaultSettings: LastCardSettings = {
  scoring: 'points',
  target: 500,
  lastCall: 'call',
  stacking: false,
  drawUntilPlayable: false,
  sevenZero: false,
  jumpIn: false,
}

// ---------------------------------------------------------------- actions

const playerIdSchema = z.string().min(1).max(64)

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('play'),
    card: cardSchema,
    /** The colour a wild names. */
    color: colorSchema.optional(),
    /** Who a 7 swaps hands with (7-0 swaps). */
    swapWith: playerIdSchema.optional(),
    /** "Last card!" was pressed before this play. */
    lastCard: z.boolean().optional(),
  }),
  z.object({ type: z.literal('draw') }),
  z.object({ type: z.literal('pass') }),
  z.object({ type: z.literal('call') }),
  z.object({ type: z.literal('catch'), targetId: playerIdSchema }),
  z.object({ type: z.literal('next_round') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'PLAYING' | 'RESULTS'
/** 'drawn': the player to move drew and may play only that card, or keep it. */
export type Stage = 'play' | 'drawn'
/** 1: clockwise, in seat order. */
export type Direction = 1 | -1

/** One move as the table saw and heard it. Everything here is public. */
export type Move =
  | {
      kind: 'play'
      playerId: PlayerId
      card: LcCard
      /** The colour now in play (named, for a wild). */
      color: Color
      /** Played out of turn. */
      jumpIn: boolean
      /** A 7's swap (7-0 swaps). */
      swapWith: PlayerId | null
      /** Left them on one card with "Last card!" said (or called for them). */
      called: boolean
    }
  | {
      kind: 'draw'
      playerId: PlayerId
      /** 0 when there was nothing left to draw. */
      count: number
      /** A draw card's (or a stack's) penalty. */
      penalty: boolean
      /** Taken for a disconnected player. */
      away: boolean
    }
  /** Kept a drawn card. */
  | { kind: 'pass'; playerId: PlayerId; away: boolean }
  /** "Last card!", called late but before anyone caught them. */
  | { kind: 'call'; playerId: PlayerId }
  | { kind: 'catch'; playerId: PlayerId; targetId: PlayerId; count: number }

export interface Seat {
  id: PlayerId
  /** Cards in hand. */
  cards: number
  /** Left mid-round; the seat is skipped. */
  left: boolean
  /** This game's points (points scoring). */
  points: number
}

export interface LastCardView {
  phase: Phase
  /** Rounds dealt in this room. */
  round: number
  /** Games played to the target (points scoring); counts with rounds otherwise. */
  game: number
  settings: LastCardSettings
  you: {
    /** 'waiting': joined mid-round, plays from the next round. */
    status: 'playing' | 'waiting'
    /** Your own cards, sorted by colour then value; [] when not playing. */
    hand: LcCard[]
    /** The card you just drew, while you choose to play or keep it. */
    drawn: LcCard | null
  }
  /** This round's players in seat order, clockwise. */
  seats: Seat[]
  /** Cards left to draw. */
  drawPile: number
  top: LcCard
  /** The colour in play. */
  color: Color
  /** Who moves; null outside PLAYING. */
  turn: PlayerId | null
  stage: Stage
  direction: Direction
  /** A stack waiting on the player to move (stacking only). */
  pendingDraw: number
  /** Went down to one card without calling; others may catch them. */
  exposed: PlayerId | null
  /** This round's moves, oldest first. */
  log: Move[]
  /** RESULTS only. */
  outcome: 'win' | 'abandoned' | null
  winnerId: PlayerId | null
  /** RESULTS only: every hand still in play, revealed. */
  hands: Record<PlayerId, LcCard[]> | null
  /** RESULTS only: what the winner scored this round. */
  roundPoints: number
  /** RESULTS only: who reached the target and won the game (points scoring). */
  champion: PlayerId | null
  /** Games won (points scoring) or rounds won. */
  scores: Record<PlayerId, number>
}
