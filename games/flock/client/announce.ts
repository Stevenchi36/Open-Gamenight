// What screen readers hear as a Flock round goes by (read out with core useAnnounce).
// Imports the ui/announce and ui/helpers subpaths, not @ogn/core/ui, so tests load it without Vue SFCs.
import type { PlayerId } from '@ogn/core/contract'
import { progressText } from '@ogn/core/ui/announce'
import type { FlockView } from '../shared/index.ts'
import { flockSummary } from './flock-summary.ts'

type Name = (id: PlayerId) => string

/** The results card's headline, from your side. */
export function roundHeadline(view: FlockView, me: PlayerId): string {
  if (view.you.status === 'waiting') return 'Round over'
  if ((view.result?.pointsAwarded[me] ?? 0) > 0) return 'You followed the flock!'
  return view.flockId ? 'You strayed from the flock' : 'Nobody scores'
}

/** The round's question, read when it comes up. */
export function roundText(view: FlockView): string {
  return `Round ${view.round}: ${view.question.text}`
}

export function announceText(now: FlockView, before: FlockView, me: PlayerId, name: Name): string | null {
  if (now.round !== before.round) return roundText(now)
  if (now.phase !== before.phase) {
    if (now.phase === 'REVIEW') return `Answers are in. ${flockSummary(now, 'so far')}`
    if (now.phase === 'RESULTS') return `${roundHeadline(now, me)}. ${flockSummary(now, 'final')}`
    return null
  }
  if (now.phase === 'ANSWERING') return progressText(now.answered, before.answered, now.roundPlayers.length, (who) => `${who} answered`, me, name)
  return null
}
