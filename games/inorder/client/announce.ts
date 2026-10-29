// What screen readers hear as an In Order round goes by (read out with core useAnnounce). Moves in
// the line are read by OrderList for your own; other players' aren't, as the line can churn.
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

export function announceText(now: InOrderView, before: InOrderView, me: PlayerId, name: Name): string | null {
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
  const ready = progressText(now.ready, before.ready, now.roundPlayers.length, (who, n) => `${who} ${who === 'You' || n > 1 ? 'are' : 'is'} ready`, me, name)
  return [...clues, ready].filter(Boolean).join(' ') || null
}
