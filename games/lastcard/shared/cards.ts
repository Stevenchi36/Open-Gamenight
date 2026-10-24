/**
 * The Last Card deck and the card rules both sides need: what may be played, what a hand
 * scores, how a hand is sorted. The client uses `canPlay` to raise playable cards, so it
 * must stay the same function the reducer checks with.
 */
import { z } from 'zod'

export const COLORS = ['red', 'yellow', 'green', 'blue'] as const
export const VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2', 'wild', 'wild4'] as const

export const colorSchema = z.enum(COLORS)
export type Color = (typeof COLORS)[number]
export type Value = (typeof VALUES)[number]

const colouredSchema = z.enum(VALUES).exclude(['wild', 'wild4'])

/** Wilds have no colour; every other card has one. */
export const cardSchema = z.union([
  z.object({ color: colorSchema, value: colouredSchema }),
  z.object({ color: z.null(), value: z.enum(['wild', 'wild4']) }),
])
export type LcCard = z.infer<typeof cardSchema>

export const isWild = (card: LcCard): boolean => card.value === 'wild' || card.value === 'wild4'
export const sameCard = (a: LcCard, b: LcCard): boolean => a.color === b.color && a.value === b.value

/** The 108 cards in a fixed order; shuffle with `ctx.rng.shuffle`. */
export function lastCardDeck(): LcCard[] {
  const deck: LcCard[] = []
  for (const color of COLORS) {
    deck.push({ color, value: '0' })
    for (const value of colouredSchema.options) if (value !== '0') deck.push({ color, value }, { color, value })
  }
  for (let i = 0; i < 4; i++) deck.push({ color: null, value: 'wild' }, { color: null, value: 'wild4' })
  return deck
}

/** What a card left in a hand scores the round's winner. */
export function cardPoints(card: LcCard): number {
  if (isWild(card)) return 50
  if (card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2') return 20
  return Number(card.value)
}

export const handPoints = (hand: readonly LcCard[]): number => hand.reduce((sum, c) => sum + cardPoints(c), 0)

/** A copy sorted by colour, then value, wilds last, as a hand is shown. */
export function sortHand(hand: readonly LcCard[]): LcCard[] {
  const order = (c: LcCard) => (c.color === null ? COLORS.length : COLORS.indexOf(c.color)) * VALUES.length + VALUES.indexOf(c.value)
  return [...hand].sort((a, b) => order(a) - order(b))
}

/** What a card is played onto. */
export interface Table {
  top: LcCard
  /** The colour in play: the top card's, or the one named for a wild. */
  color: Color
  /** Cards a stack makes the player to move draw; 0 when none is pending. */
  pendingDraw: number
}

/**
 * Whether `card` may be played from `hand` on your turn. Facing a stack, only a Draw Two (on a
 * Draw Two) or a Wild Draw Four answers it. Otherwise: match the colour or the value, or play a
 * wild; a Wild Draw Four only when the hand holds nothing of the colour in play.
 */
export function canPlay(card: LcCard, hand: readonly LcCard[], table: Table): boolean {
  if (table.pendingDraw > 0) return card.value === 'wild4' || (card.value === 'draw2' && table.top.value === 'draw2')
  if (card.value === 'wild') return true
  if (card.value === 'wild4') return !hand.some((c) => c.color === table.color)
  return card.color === table.color || card.value === table.top.value
}

/** Whether `card` may jump in out of turn: identical to the top card, never a wild. */
export function canJumpIn(card: LcCard, table: Table): boolean {
  return !isWild(card) && sameCard(card, table.top)
}
