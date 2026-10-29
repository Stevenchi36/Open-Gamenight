// What screen readers hear as an In Order round goes by (read out with core useAnnounce). Your own
// moves in the line are read by OrderList as you make them, so `isOwn` skips their echo here.
// Imports the ui/announce and ui/helpers subpaths, not @ogn/core/ui, so tests load it without Vue SFCs.
import type { PlayerId } from '@ogn/core/contract'
import { progressText } from '@ogn/core/ui/announce'
import type { InOrderView } from '../shared/index.ts'
import { roundDetail, roundHeadline } from './reveal.ts'

type Name = (id: PlayerId) => string

/** The round's theme and what its ends mean. */
export function roundText(view: InOrderView): string {
  const of = view.totalRounds ? ` of ${view.totalRounds}` : ''
  return `Round ${view.round}${of}: ${view.theme.text}. 1 is ${view.theme.low}, 100 is ${view.theme.high}.`
}

type Move = { id: string; to: number }

/**
 * Every single-card move that turns one order of the same cards into the other: one card, or
 * either of two neighbours that swapped. Empty if several moves arrived together, or none.
 */
export function cardMoves(before: string[], now: string[]): Move[] {
  if (before.length !== now.length || before.join('|') === now.join('|')) return []
  const without = (ids: string[], id: string) => ids.filter((x) => x !== id).join('|')
  return now.filter((id) => without(before, id) === without(now, id)).map((id) => ({ id, to: now.indexOf(id) }))
}

/** The card that moved, the one that went further when two fit; null if it isn't one card's move. */
export function movedCard(before: string[], now: string[]): Move | null {
  const dist = (m: Move) => Math.abs(m.to - before.indexOf(m.id))
  return cardMoves(before, now).reduce<Move | null>((a, b) => (a && dist(a) >= dist(b) ? a : b), null)
}

function lineText(now: InOrderView, before: InOrderView, name: Name, isOwn: (id: string, to: number) => boolean): string | null {
  const ids = now.line.map((i) => i.id)
  const was = before.line.map((i) => i.id)
  if ([...ids].sort().join('|') !== [...was].sort().join('|')) return null
  const moved = movedCard(was, ids)
  if (!moved) return ids.join('|') === was.join('|') ? null : 'The line was rearranged.'
  // A swap fits either card, so yours may be the other one.
  if (cardMoves(was, ids).some((m) => isOwn(m.id, m.to))) return null
  const item = now.line[moved.to]!
  return `${item.clue ?? `${name(item.playerId)}'s card`} moved to ${moved.to + 1} of ${ids.length}.`
}

export function announceText(now: InOrderView, before: InOrderView, me: PlayerId, name: Name, isOwn: (id: string, to: number) => boolean = () => false): string | null {
  if (now.round !== before.round) return roundText(now)
  if (now.phase === 'RESULTS' && before.phase !== 'RESULTS' && now.result) {
    // A won game is read out by its celebration, which says the same.
    if (now.result.outcome === 'won') return null
    return `${roundHeadline(now.result, 'You made it!')}. ${roundDetail(now.result, now)}`
  }
  if (now.phase !== 'ORDERING') return null
  const clues = now.line
    .filter((item) => item.clue !== null && before.line.find((b) => b.id === item.id)?.clue == null)
    .map((item) => `${item.playerId === me ? 'Your' : `${name(item.playerId)}'s`} clue: ${item.clue}.`)
  const line = lineText(now, before, name, isOwn)
  const ready = progressText(now.ready, before.ready, now.roundPlayers.length, (who, n) => `${who} ${who === 'You' || n > 1 ? 'are' : 'is'} ready`, me, name)
  return [...clues, line, ready].filter(Boolean).join(' ') || null
}
