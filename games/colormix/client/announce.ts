// What screen readers hear as a Color Mix round goes by (read out with core useAnnounce).
// Imports the ui/announce and ui/helpers subpaths, not @ogn/core/ui, so tests load it without Vue SFCs.
import type { PlayerId } from '@ogn/core/contract'
import { progressText } from '@ogn/core/ui/announce'
import { ordinal } from '@ogn/core/ui/helpers'
import type { ColorMixView } from '../shared/index.ts'

type Name = (id: PlayerId) => string

/** The round coming up. The colours are only shown, as there are no names for most of them. */
export function roundText(view: ColorMixView): string {
  const of = view.totalRounds ? ` of ${view.totalRounds}` : ''
  return `Round ${view.round}${of}: mix ${view.colors.length} colours in equal parts.`
}

/** Who came closest, and your place if you didn't: "Closest: Sam. You came 3rd." */
export function resultText(view: ColorMixView, me: PlayerId, name: Name): string | null {
  const guesses = view.result?.guesses ?? []
  if (guesses.length === 0) return 'Nobody guessed.'
  const best = guesses.filter((g) => g.distance === guesses[0]!.distance).map((g) => (g.playerId === me ? 'you' : name(g.playerId)))
  const mine = guesses.findIndex((g) => g.playerId === me)
  // Equal distances share a place, as on the results list.
  const place = mine === -1 ? 0 : guesses.findIndex((g) => g.distance === guesses[mine]!.distance) + 1
  const yours = place > 1 ? ` You came ${ordinal(place)}.` : ''
  return `Closest: ${best.join(' and ')}.${yours}`
}

export function announceText(now: ColorMixView, before: ColorMixView, me: PlayerId, name: Name): string | null {
  if (now.round !== before.round) return roundText(now)
  if (now.phase === 'RESULTS' && before.phase !== 'RESULTS') return resultText(now, me, name)
  if (now.phase === 'GUESSING') return progressText(now.guessed, before.guessed, now.roundPlayers.length, (who) => `${who} guessed`, me, name)
  return null
}
