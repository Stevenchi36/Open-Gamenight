import type { PlayerId } from '@ogn/core/contract'
import { placings } from '@ogn/core/kit'
import type { Standing } from '@ogn/core/client'
import { COLORS, type Color, type DotsView } from '../shared/index.ts'

/** Distinct in light and dark themes; red and blue match Drop Line's discs. */
const HEX: Record<Color, string> = { red: '#e53935', blue: '#1e88e5', green: '#43a047', orange: '#fb8c00' }

export const seatColor = (seat: number): string => HEX[COLORS[seat]!]

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
