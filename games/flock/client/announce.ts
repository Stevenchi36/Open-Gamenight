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

/**
 * The host's merge or split during review, then where the flock stands: "Sam merged Pizzas into
 * Pizza. The flock says Pizza so far (4 players)."; null when the groups didn't change.
 */
export function groupsText(now: FlockView, before: FlockView, me: PlayerId, hostId: PlayerId, name: Name): string | null {
  const ids = new Set(now.groups.map((g) => g.id))
  const was = new Set(before.groups.map((g) => g.id))
  const gone = before.groups.filter((g) => !ids.has(g.id))
  const added = now.groups.filter((g) => !was.has(g.id))
  if (gone.length === 0 && added.length === 0) return null
  const host = hostId === me ? 'You' : name(hostId)
  let change: string
  if (gone.length > 0 && added.length === 0) {
    // Merged: the group that grew took them in.
    const into = now.groups.find((g) => g.answers.length > (before.groups.find((b) => b.id === g.id)?.answers.length ?? 0))
    change = into ? `${host} merged ${gone.map((g) => g.label).join(' and ')} into ${into.label}.` : `${host} merged answers.`
  } else {
    // Split: the group that shrank, or went, gave them back.
    const from = gone[0] ?? before.groups.find((b) => (now.groups.find((g) => g.id === b.id)?.answers.length ?? 0) < b.answers.length)
    change = from ? `${host} split ${from.label}.` : `${host} split answers.`
  }
  return `${change} ${flockSummary(now, 'so far')}`
}

export function announceText(now: FlockView, before: FlockView, me: PlayerId, name: Name, hostId: PlayerId): string | null {
  if (now.round !== before.round) return roundText(now)
  if (now.phase !== before.phase) {
    if (now.phase === 'REVIEW') return `Answers are in. ${flockSummary(now, 'so far')}`
    if (now.phase === 'RESULTS') return `${roundHeadline(now, me)}. ${flockSummary(now, 'final')}`
    return null
  }
  if (now.phase === 'REVIEW') return groupsText(now, before, me, hostId, name)
  if (now.phase === 'ANSWERING') return progressText(now.answered, before.answered, now.roundPlayers.length, (who) => `${who} answered`, me, name)
  return null
}
