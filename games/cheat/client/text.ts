import type { PlayerId } from '@wsfg/core/contract'
import { placings, rankName, type Rank } from '@wsfg/core/kit'
import type { Standing } from '@wsfg/core/client'
import type { CheatView, Move } from '../shared/index.ts'

const NUMBERS = ['no', 'one', 'two', 'three', 'four']

/** "two sevens", "one ace". */
export function claimText(count: number, claim: Rank): string {
  return `${NUMBERS[count] ?? count} ${rankName(claim, count)}`
}

/** "sevens", "sixes, sevens or eights": the ranks a play may claim. */
export function claimsText(claims: Rank[]): string {
  if (claims.length > 3) return 'any rank'
  const names = claims.map((r) => rankName(r))
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`
}

/**
 * One move as a sentence, from the viewer's side: "You called Cheat on Bea's two sevens: a lie!"
 * `name` turns an id into a display name (the viewer reads as "You"/"you").
 */
export function moveText(move: Move, me: PlayerId, name: (id: PlayerId) => string): string {
  const who = (id: PlayerId) => (id === me ? 'You' : name(id))
  switch (move.kind) {
    case 'play':
      return `${who(move.playerId)} played ${claimText(move.count, move.claim)}.`
    case 'skip':
      return move.playerId === me ? 'You were away, so your turn passed.' : `${name(move.playerId)} was away, so their turn passed.`
    case 'call': {
      const whose = move.playerId === me ? 'your' : `${name(move.playerId)}'s`
      const verdict = move.lied ? 'a lie!' : 'all true.'
      const picks = move.pickerId === me ? 'You pick' : `${name(move.pickerId)} picks`
      const cards = move.picked === 1 ? '1 card' : `${move.picked} cards`
      return `${who(move.callerId)} called Cheat on ${whose} ${claimText(move.count, move.claim)}: ${verdict} ${picks} up the pile (${cards}).`
    }
  }
}

/** For the move list: a call that caught a lie paid off for the caller, one on an honest play didn't. */
export function moveTone(move: Move): 'success' | 'error' | null {
  return move.kind === 'call' ? (move.lied ? 'success' : 'error') : null
}

/** Places by fewest cards left for the win podium. Leavers can't win, so they aren't placed. */
export function standings(view: CheatView, me: PlayerId, name: (id: PlayerId) => string): Standing[] {
  return placings(
    view.seats.filter((s) => !s.left),
    (s) => -s.cards,
  ).map(({ item, place }) => ({
    id: item.id,
    name: item.id === me ? 'You' : name(item.id),
    place,
    detail: item.cards === 0 ? 'Out of cards' : `${item.cards} ${item.cards === 1 ? 'card' : 'cards'} left`,
  }))
}
