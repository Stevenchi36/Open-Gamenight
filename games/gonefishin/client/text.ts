import type { PlayerId } from '@wsfg/core/contract'
import { placings, rankName } from '@wsfg/core/kit'
import type { Standing } from '@wsfg/core/client'
import type { GoneFishinView, Move } from '../shared/index.ts'

const NUMBERS = ['no', 'one', 'two', 'three']

/**
 * One move as a sentence, from the viewer's side: "You asked Bea for sevens and got two."
 * `name` turns an id into a display name (the viewer reads as "You"/"you").
 */
export function moveText(move: Move, me: PlayerId, name: (id: PlayerId) => string): string {
  const asker = move.askerId === me ? 'You' : name(move.askerId)
  const books = move.books.length > 0 ? ` Book of ${move.books.map((r) => rankName(r)).join(' and ')}!` : ''
  if (move.targetId === null || move.rank === null) return `${asker} had nobody to ask, so ${move.askerId === me ? 'you' : 'they'} drew from the pond.${books}`

  const target = move.targetId === me ? 'you' : name(move.targetId)
  const asked = `${asker} asked ${target} for ${rankName(move.rank)}`
  if (move.given > 0) return `${asked} and got ${NUMBERS[move.given] ?? move.given}.${books}`
  if (!move.drew) return `${asked}. Gone fishin', but the pond is empty.`
  if (move.lucky) return `${asked}. Gone fishin'… and caught a ${rankName(move.rank, 1)}!${books}`
  return `${asked}. Gone fishin'!${books}`
}

/** "You win!", "Bea wins", "You and Al tie". `me` may be SPECTATOR_ID, which never says "you". */
export function resultTitle(view: GoneFishinView, me: PlayerId, name: (id: PlayerId) => string): string {
  const ids = view.winnerIds
  if (ids.length === 1) return ids[0] === me ? 'You win!' : `${name(ids[0]!)} wins`
  const names = ids.map((id) => (id === me ? 'You' : name(id)))
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)} tie`
}

/** Places by books for the win podium. Leavers can't win, so they aren't placed. */
export function standings(view: GoneFishinView, me: PlayerId, name: (id: PlayerId) => string): Standing[] {
  return placings(
    view.seats.filter((s) => !s.left),
    (s) => s.books.length,
  ).map(({ item, place }) => ({
    id: item.id,
    name: item.id === me ? 'You' : name(item.id),
    place,
    detail: `${item.books.length} ${item.books.length === 1 ? 'book' : 'books'}`,
  }))
}
