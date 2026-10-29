// What screen readers hear as a Ballpark round goes by (read out with core useAnnounce).
// Imports the ui/announce and ui/helpers subpaths, not @ogn/core/ui, so tests load it without Vue SFCs.
import { progressText } from '@ogn/core/ui/announce'
import type { PlayerId } from '@ogn/core/contract'
import { TOO_HIGH, type BallparkSettings, type BallparkView } from '../shared/index.ts'
import { formatValue } from './format.ts'

type Name = (id: PlayerId) => string

/** Who was closest, as the results card says it: "Closest: you and Sam." */
export function closestText(view: Pick<BallparkView, 'slots' | 'result'>, me: PlayerId, name: Name, winRule: BallparkSettings['winRule']): string {
  const winning = view.slots.filter((s) => view.result?.winningSlotIds.includes(s.id))
  if (winning.length === 0) return ''
  if (winning[0]!.id === TOO_HIGH) return 'Every guess was too high!'
  const names = winning.flatMap((s) => s.playerIds).map((id) => (id === me ? 'you' : name(id)))
  return `${winRule === 'over' ? 'Closest without going over' : 'Closest'}: ${names.join(' and ')}.`
}

/** The round's question, read when it comes up. */
export function roundText(view: BallparkView): string {
  const of = view.totalRounds ? ` of ${view.totalRounds}` : ''
  const unit = view.question.unit ? ` Answer in ${view.question.unit}.` : ''
  return `Round ${view.round}${of}: ${view.question.text}${unit}`
}

export function announceText(now: BallparkView, before: BallparkView, me: PlayerId, name: Name, settings: BallparkSettings): string | null {
  if (now.round !== before.round) return roundText(now)
  if (now.phase !== before.phase) {
    if (now.phase === 'BETTING') return 'Guesses are in. Time to bet on the closest.'
    if (now.phase === 'RESULTS' && now.result) {
      const answer = `The answer: ${formatValue(now.result.answer, now.question.unit)}.`
      return [answer, now.result.fact, closestText(now, me, name, settings.winRule)].filter(Boolean).join(' ')
    }
    return null
  }
  if (now.phase === 'GUESSING') return progressText(now.guessed, before.guessed, now.roundPlayers.length, (who) => `${who} guessed`, me, name)
  if (now.phase === 'BETTING') return progressText(now.betted, before.betted, now.roundPlayers.length, (who) => `${who} bet`, me, name)
  return null
}
