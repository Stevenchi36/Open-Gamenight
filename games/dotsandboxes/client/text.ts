import type { PlayerId } from '@ogn/core/contract'
import { placings } from '@ogn/core/kit'
import type { Standing } from '@ogn/core/client'
import { COLORS, type Color, type DotsView, type Line } from '../shared/index.ts'

/** Distinct in light and dark themes; red and blue match Drop Line's discs. */
const HEX: Record<Color, string> = { red: '#e53935', blue: '#1e88e5', green: '#43a047', orange: '#fb8c00' }

export const seatColor = (seat: number): string => HEX[COLORS[seat]!]

/** A box's initial: white reads at 3:1 (it's large, bold text) on all but orange, which takes dark. */
export const onSeatColor = (seat: number): string => (COLORS[seat] === 'orange' ? '#1a1a1a' : '#fff')

/** Where a line is, as the board's targets name it: "across from row 2, dot 1". */
export function lineWhere(l: Line): string {
  return l.dir === 'h' ? `across from row ${l.row + 1}, dot ${l.col + 1}` : `down from row ${l.row + 1}, dot ${l.col + 1}`
}

/**
 * The newest line as a sentence, or null if there isn't a new one: "Bea drew across from row 2,
 * dot 1 and claimed 2 boxes". A line that claims a box is its drawer's (they go again); otherwise
 * it was drawn by whoever's turn it was.
 */
export function moveText(now: DotsView, before: DotsView, me: PlayerId, name: (id: PlayerId) => string): string | null {
  const l = now.last
  if (now.game !== before.game || !l || (before.last && before.last.dir === l.dir && before.last.row === l.row && before.last.col === l.col)) return null
  const owners = now.boxes.flatMap((row, r) => row.flatMap((owner, c) => (owner !== null && before.boxes[r]?.[c] == null ? [owner] : [])))
  const drawer = owners.length > 0 ? now.seats[owners[0]!]?.id : before.turn
  const claimed = owners.length === 0 ? '' : ` and claimed ${owners.length === 1 ? 'a box' : `${owners.length} boxes`}`
  if (!drawer) return `Line drawn ${lineWhere(l)}${claimed}`
  return `${drawer === me ? 'You' : name(drawer)} drew ${lineWhere(l)}${claimed}`
}

/** "You win!", "Bea wins", "You and Al share the win". `me` may be SPECTATOR_ID, which never says "you". */
export function resultTitle(view: DotsView, me: PlayerId, name: (id: PlayerId) => string): string {
  const names = view.winnerIds.map((id) => (id === me ? 'You' : name(id)))
  if (names.length === 1) return view.winnerIds[0] === me ? 'You win!' : `${names[0]} wins`
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)} share the win`
}

/** The winners' box count. */
export function mostBoxes(view: DotsView): number {
  return Math.max(0, ...view.seats.filter((s) => view.winnerIds.includes(s.id)).map((s) => s.boxes))
}

/** Places by boxes for the win podium. Leavers can't win, so they aren't placed. */
export function standings(view: DotsView, me: PlayerId, name: (id: PlayerId) => string): Standing[] {
  return placings(
    view.seats.filter((s) => !s.left),
    (s) => s.boxes,
  ).map(({ item, place }) => ({
    id: item.id,
    name: item.id === me ? 'You' : name(item.id),
    place,
    detail: `${item.boxes} ${item.boxes === 1 ? 'box' : 'boxes'}`,
  }))
}

/** The winners' colours, with gold and white for sparkle. */
export function winnerConfetti(view: DotsView): string[] {
  const seats = view.seats.flatMap((s, i) => (view.winnerIds.includes(s.id) ? [seatColor(i)] : []))
  return [...seats, ...seats, '#ffd54f', '#ffffff']
}
