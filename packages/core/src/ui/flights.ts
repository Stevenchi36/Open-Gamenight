// Card movement for `CardTable`: a game describes what moved (from its move log) as flights,
// and the table animates each new one once. Live changes only: flights present when the table
// mounts are taken as already seen, except a deal's, since the table mounts with each new game.
import { shallowRef, watch } from 'vue'
import type { PlayerId } from '../contract.ts'

export interface CardFlight<C = unknown> {
  /** Unique within the room's life, e.g. `${game}:${logIndex}`; a new id animates once. */
  id: string
  /** A seat's player id, `'center'` (the felt), or a `data-card-anchor` name inside the table. The viewer's own seat means their hand when it's on screen. */
  from: string
  to: string
  /** Cards moving; up to `MAX_FLIGHT_CARDS` are drawn. Defaults to the number of faces, or 1. */
  count?: number
  /** Faces of cards seen face up (rendered by the table's `flight` slot); the rest fly face down. */
  faces?: C[]
  /** Turn face up on the way. */
  flip?: boolean
  /** Spread side by side at the end, raised this many px above the target (a reveal). */
  rise?: number
  /** ms to rest at the end before fading. */
  hold?: number
  /** ms before the first card leaves. */
  delay?: number
  /** ms between cards; 70 by default. */
  stagger?: number
  /** Animates even when the table has just mounted (a deal). */
  onMount?: boolean
}

export const FLIGHT_MS = 520
export const MAX_FLIGHT_CARDS = 6
const DEAL_CARDS = 5
const DEAL_GAP_MS = 45

export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Round-robin from `from` to every seat still holding cards, a few cards each to stand for the hand. */
export function dealFlights(id: string, from: string, seats: readonly { id: PlayerId; cards: number }[]): CardFlight<never>[] {
  const n = seats.length
  return seats
    .filter((s) => s.cards > 0)
    .map((s) => ({
      id: `${id}:${s.id}`,
      from,
      to: s.id,
      count: Math.min(s.cards, DEAL_CARDS),
      delay: seats.indexOf(s) * DEAL_GAP_MS,
      stagger: n * DEAL_GAP_MS,
      onMount: true,
    }))
}

/** When `dealFlights` for this many seats has landed. */
export function dealTime(seatCount: number): number {
  return (DEAL_CARDS * seatCount - 1) * DEAL_GAP_MS + FLIGHT_MS
}

/**
 * For a hand: which cards are new since the hand last changed, so they can pop into place
 * (after the flight bringing them lands). `v-bind` the result on each card's element.
 * `onMount` plays it for the whole hand on first render too (a fresh deal). `delay` (ms) is
 * when the first card drops in: by default just as a plain flight lands.
 */
export function useArrivals(keys: () => readonly string[], onMount = false, delay: () => number = () => FLIGHT_MS - 90) {
  const fresh = shallowRef(new Map<string, number>())
  let wait = 0
  const mark = (now: readonly string[], before: readonly string[]) => {
    const old = new Set(before)
    const next = new Map<string, number>()
    if (!reducedMotion()) for (const k of now) if (!old.has(k)) next.set(k, next.size)
    wait = delay()
    fresh.value = next
  }
  // Joined so the watch fires only when the hand itself changes, not on every view.
  watch(
    () => keys().join('|'),
    (now, before) => mark(now.split('|'), before.split('|')),
  )
  if (onMount) mark(keys(), [])
  return (key: string): Record<string, unknown> => {
    const i = fresh.value.get(key)
    return i === undefined ? {} : { class: 'card-arrive', style: { '--arrive-i': i, '--arrive-delay': `${wait}ms` } }
  }
}

/** Keys for cards that can repeat in a hand (two red 5s): the card's own key plus which copy it is. */
export function occurrenceKeys<T>(items: readonly T[], key: (item: T) => string): string[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const k = key(item)
    const n = seen.get(k) ?? 0
    seen.set(k, n + 1)
    return `${k}#${n}`
  })
}
