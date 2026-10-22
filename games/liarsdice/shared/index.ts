/**
 * Liar's Dice types shared by the server module and the Vue client:
 * settings, client actions, the per-player view, and the bid rules
 * (the client uses them to offer only legal raises).
 */
import { z } from 'zod'

type PlayerId = string

export const GAME_ID = 'liarsdice'
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 10
export const FACES = 6
/** How long the revealed dice stay up before the next round rolls. */
export const REVEAL_MS = 8_000

// ---------------------------------------------------------------- settings

export const settingsSchema = z.object({
  startingDice: z.number().int().min(1).max(6),
  /** Ones count as every face; bids on ones follow the Perudo half/double rule. */
  wildOnes: z.boolean(),
  /** Allows the exact-count call. */
  spotOn: z.boolean(),
})

export type LiarsDiceSettings = z.infer<typeof settingsSchema>

export const defaultSettings: LiarsDiceSettings = {
  startingDice: 5,
  wildOnes: true,
  spotOn: false,
}

// ---------------------------------------------------------------- actions

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('bid'),
    quantity: z.number().int().min(1).max(100),
    face: z.number().int().min(1).max(FACES),
  }),
  z.object({ type: z.literal('call') }),
  z.object({ type: z.literal('spot_on') }),
  z.object({ type: z.literal('new_match') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- bid rules

export interface Bid {
  playerId: PlayerId
  quantity: number
  face: number
}

type BidValue = Pick<Bid, 'quantity' | 'face'>

/** Whether `next` is a legal bid after `prev` (null: the opening bid of a round). */
export function isLegalBid(prev: BidValue | null, next: BidValue, wildOnes: boolean): boolean {
  if (next.quantity < 1 || next.face < 1 || next.face > FACES) return false
  if (!prev) return !(wildOnes && next.face === 1)
  if (!wildOnes || (prev.face !== 1 && next.face !== 1)) {
    return next.quantity > prev.quantity || (next.quantity === prev.quantity && next.face > prev.face)
  }
  if (prev.face === 1 && next.face === 1) return next.quantity > prev.quantity
  if (next.face === 1) return next.quantity >= Math.ceil(prev.quantity / 2)
  return next.quantity >= prev.quantity * 2 + 1
}

/** The smallest legal quantity for `face` after `prev`; null when that face can't be bid (opening on wild ones). */
export function minQuantity(prev: BidValue | null, face: number, wildOnes: boolean): number | null {
  if (!prev && wildOnes && face === 1) return null
  let q = 1
  while (!isLegalBid(prev, { quantity: q, face }, wildOnes)) q++
  return q
}

/** Dice showing `face`, counting ones as wild when enabled. */
export function countFace(dice: readonly number[], face: number, wildOnes: boolean): number {
  return dice.filter((d) => d === face || (wildOnes && face !== 1 && d === 1)).length
}

// ---------------------------------------------------------------- view

export type Phase = 'BIDDING' | 'REVEAL' | 'RESULTS'

export interface RoundResult {
  /** Everyone's dice that round, by player. */
  dice: Record<PlayerId, number[]>
  bid: Bid
  callerId: PlayerId
  call: 'liar' | 'spot_on'
  /** Dice matching the bid's face (wild ones included). */
  count: number
  loserId: PlayerId | null
  /** Spot on, called right. */
  gainerId: PlayerId | null
}

export interface Seat {
  id: PlayerId
  /** 0 = out of this match. */
  dice: number
}

export interface LiarsDiceView {
  phase: Phase
  round: number
  you: {
    /** 'waiting': joined mid-match, plays from the next match. */
    status: 'playing' | 'out' | 'waiting'
    /** Your own dice this round (sorted); [] when not playing. */
    dice: number[]
  }
  /** Match players in seat order (turns go this way), with dice counts. */
  seats: Seat[]
  totalDice: number
  /** Whose move it is; null outside BIDDING. */
  turn: PlayerId | null
  bid: Bid | null
  /** This round's bids, oldest first. */
  bids: Bid[]
  /** The latest challenge: shown in REVEAL, then as a summary. */
  lastRound: RoundResult | null
  /** RESULTS only. */
  winnerId: PlayerId | null
  scores: Record<PlayerId, number>
}
