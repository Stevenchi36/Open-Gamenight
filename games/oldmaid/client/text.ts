import type { Standing } from '@ogn/core/client'
import type { PlayerId } from '@ogn/core/contract'
import { rankName, type Card } from '@ogn/core/kit'
import type { Move, OldMaidView } from '../shared/index.ts'

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' } as const

/** "7♥" */
export function cardText(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`
}

/**
 * One draw as a sentence, from the viewer's side: "You took the 7♥ from Bea." A card that made
 * no pair is named only to the two players who know it. `name` turns an id into a display name.
 */
export function moveText(move: Move, me: PlayerId, name: (id: PlayerId) => string): string {
  const who = (id: PlayerId, start: boolean) => (id === me ? (start ? 'You' : 'you') : name(id))
  const card = move.card ? `the ${cardText(move.card)}` : 'a card'
  const took = `${who(move.drawerId, true)} took ${card} from ${who(move.fromId, false)}${move.away ? ' (drawn for them)' : ''}.`
  const pair = move.pair ? ` Pair of ${rankName(move.pair[0].rank)}!` : ''
  const out = move.out.map((id) => ` ${id === me ? "You're" : `${name(id)} is`} out!`).join('')
  return took + pair + out
}

/** For the move list: a pair went down (good for the drawer), or not. */
export function moveTone(move: Move): 'success' | null {
  return move.pair ? 'success' : null
}

/** "Bea is the Old Maid!"; "You're the Old Maid!" `me` may be SPECTATOR_ID, which never says "you". */
export function maidTitle(view: OldMaidView, me: PlayerId, name: (id: PlayerId) => string): string {
  if (!view.maidId) return ''
  return view.maidId === me ? "You're the Old Maid!" : `${name(view.maidId)} is the Old Maid!`
}

/** Royale's last round, which celebrates the winner instead: "You win the Royale!"; "Cal wins the Royale!" */
export function royaleWinTitle(view: OldMaidView, me: PlayerId, name: (id: PlayerId) => string): string {
  if (!view.royaleWinnerId) return ''
  return view.royaleWinnerId === me ? 'You win the Royale!' : `${name(view.royaleWinnerId)} wins the Royale!`
}

/** Under the win: who was caught last. */
export function royaleWinSubtitle(view: OldMaidView, me: PlayerId, name: (id: PlayerId) => string): string {
  if (!view.maidId) return ''
  return view.maidId === me ? "You're the Old Maid" : `${name(view.maidId)} is the Old Maid`
}

/**
 * The won Royale's podium: the winner, then each Old Maid from the last caught to the first.
 * Every round of a Royale catches one, so a player's index in `royaleOut` is their round. Leavers aren't placed.
 */
export function royaleStandings(view: OldMaidView, me: PlayerId, name: (id: PlayerId) => string): Standing[] {
  if (!view.royaleWinnerId) return []
  const left = new Set(view.seats.filter((s) => s.left).map((s) => s.id))
  const who = (id: PlayerId) => (id === me ? 'You' : name(id))
  const caught = view.royaleOut
    .map((id, i) => ({ id, detail: `Old Maid in round ${i + 1}` }))
    .reverse()
    .filter((s) => !left.has(s.id))
  return [{ id: view.royaleWinnerId, detail: 'Last one in' }, ...caught].map((s, i) => ({ ...s, name: who(s.id), place: i + 1 }))
}

/** Under the reveal: what being caught means in this format. */
export function maidSubtitle(view: OldMaidView, me: PlayerId, name: (id: PlayerId) => string): string {
  if (view.settings.format === 'classic') return 'Everyone else scores a point'
  if (view.royaleWinnerId) return `${view.royaleWinnerId === me ? 'You win' : `${name(view.royaleWinnerId)} wins`} the Royale`
  return view.maidId === me ? "You're out of the Royale" : 'Out of the Royale'
}
