/**
 * Cheat types shared by the server module and the Vue client:
 * settings, client actions and the per-player view.
 */
import type { GameMeta } from '@ogn/core/contract'
import { moveHistorySchema, RANKS, rankSchema, SUITS, type Card, type Rank } from '@ogn/core/kit'
import { z } from 'zod'

type PlayerId = string

export const GAME_ID = 'cheat'
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 10

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: 'Cheat',
  description: 'Play cards face down, say what they are, and call out the liars.',
  styles: ['card', 'deduction'],
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
}

/** The most cards in one play: a deck holds four of each rank. */
export const MAX_PLAY = 4

/** The ranks a play may claim. `last` is the latest claim this game (null before the first play). */
export function allowedClaims(claims: Claims, last: Rank | null): Rank[] {
  const at = (i: number) => RANKS[(i + RANKS.length) % RANKS.length]!
  if (last === null) return claims === 'next' ? ['A'] : [...RANKS]
  const i = RANKS.indexOf(last)
  return claims === 'next' ? [at(i + 1)] : [at(i - 1), last, at(i + 1)]
}

// ---------------------------------------------------------------- settings

export const claimsSchema = z.enum(['next', 'nearby'])
export type Claims = z.infer<typeof claimsSchema>

export const settingsSchema = z.object({
  /** 'next': the rank after the last claim; 'nearby': the same, one up or one down. */
  claims: claimsSchema,
  /** Seconds after each play when calls are open and the next player waits. */
  callSeconds: z.union([z.literal(3), z.literal(5), z.literal(10), z.literal(20)]),
  /** How many past plays and calls players can look back at; remembering the claims is the skill. */
  moveHistory: moveHistorySchema,
})

export type CheatSettings = z.infer<typeof settingsSchema>

export const defaultSettings: CheatSettings = {
  claims: 'next',
  callSeconds: 5,
  moveHistory: 'last5',
}

// ---------------------------------------------------------------- actions

const cardSchema = z.object({ rank: rankSchema, suit: z.enum(SUITS) })

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), cards: z.array(cardSchema).min(1).max(MAX_PLAY), claim: rankSchema }),
  /** `play`: the number of the play being called, so a late tap can't hit a newer one. */
  z.object({ type: z.literal('call'), play: z.number().int().min(1) }),
  z.object({ type: z.literal('new_game') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'PLAYING' | 'RESULTS'
/** 'calling': the call time after a play, when the next player waits; 'play': the turn player may play. */
export type Stage = 'calling' | 'play'

/** One move as the table saw and heard it. Everything here is public. */
export type Move =
  | { kind: 'play'; playerId: PlayerId; count: number; claim: Rank }
  | {
      kind: 'call'
      callerId: PlayerId
      /** Who made the called play. */
      playerId: PlayerId
      count: number
      claim: Rank
      /** The called play, turned up. */
      cards: Card[]
      lied: boolean
      /** Who picked up the pile, and how many cards it held. */
      pickerId: PlayerId
      picked: number
    }
  /** A disconnected player's turn passed without a play. */
  | { kind: 'skip'; playerId: PlayerId }

export interface Seat {
  id: PlayerId
  /** Cards in hand. */
  cards: number
  /** Left mid-game; their hand was set aside. */
  left: boolean
}

/** The latest play, while it can still be called. */
export interface TopPlay {
  /** Plays are numbered from 1 through the game; a call names the one it's for. */
  play: number
  playerId: PlayerId
  count: number
  claim: Rank
}

export interface CheatView {
  phase: Phase
  game: number
  settings: CheatSettings
  you: {
    /** 'waiting': joined mid-game, plays from the next game. */
    status: 'playing' | 'waiting'
    /** Your own cards, sorted by rank; [] when not playing. */
    hand: Card[]
  }
  /** This game's players in seat order (turns go this way, clockwise). */
  seats: Seat[]
  /** Cards in the pile. */
  pile: number
  top: TopPlay | null
  /** What the turn player may claim. */
  claims: Rank[]
  /** Who plays next; null outside PLAYING. */
  turn: PlayerId | null
  stage: Stage
  /** Server time the call time ends; null outside the calling stage. */
  callUntil: number | null
  /** This game's moves, oldest first, trimmed to `settings.moveHistory`: always the latest one, so only empty before the first move. */
  log: Move[]
  /** Moves before `log[0]`, so `logStart + log.length` is the move count. */
  logStart: number
  /** RESULTS only. */
  outcome: 'win' | 'abandoned' | null
  winnerId: PlayerId | null
  scores: Record<PlayerId, number>
}
