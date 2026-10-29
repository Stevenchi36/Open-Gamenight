// What screen readers hear as an Imposter round goes by (read out with core useAnnounce). Never a
// secret: your word or role stays behind Hold to reveal, and the secret word is read only once
// RESULTS shows it to everyone.
// Imports the ui/announce and ui/helpers subpaths, not @ogn/core/ui, so tests load it without Vue SFCs.
import type { PlayerId } from '@ogn/core/contract'
import { progressText } from '@ogn/core/ui/announce'
import type { ImposterView, ResultView } from '../shared/index.ts'

type Name = (id: PlayerId) => string

/** The reveal card's wording: "Caught!" or "The imposter escaped", then how the vote went. */
export function revealHeadline(result: ResultView): string {
  return result.caught ? 'Caught!' : 'The imposter escaped'
}

export function revealDetail(result: ResultView, name: Name): string {
  if (result.caught) return 'The group voted them out.'
  if (!result.accusedId) return "It's a tie, so nobody was voted out."
  return `The group voted for ${name(result.accusedId)}, who was innocent.`
}

/** The round coming up; the same for crew and imposter, so it gives nothing away. */
export function roundText(view: ImposterView): string {
  return `Round ${view.round}. Hold your card to see your word.`
}

function phaseText(view: ImposterView, me: PlayerId, name: Name): string | null {
  const r = view.result
  const who = (id: PlayerId) => (id === me ? 'You' : name(id))
  switch (view.phase) {
    case 'VOTING':
      return 'Time to vote: who is the imposter?'
    case 'REVEAL':
      return r ? `${revealHeadline(r)} ${who(r.imposterId)} ${r.imposterId === me ? 'were' : 'was'} the imposter. ${revealDetail(r, name)}` : null
    case 'GUESS_CHECK':
      return r ? `${who(r.imposterId)} ${r.imposterId === me ? 'get' : 'gets'} one guess at the word.` : null
    case 'RESULTS':
      if (!r) return null
      if (r.voided) return 'Round cancelled: the imposter left, so nobody scores.'
      return `${r.imposterWon ? 'The imposter wins' : 'The crew wins'}. The word was ${r.secretWord}.`
    default:
      return null
  }
}

export function announceText(now: ImposterView, before: ImposterView, me: PlayerId, name: Name): string | null {
  if (now.round !== before.round) return roundText(now)
  if (now.phase !== before.phase) return phaseText(now, me, name)
  if (now.phase === 'CLUES') {
    // Typed clues as they arrive, then whose turn it is now (yours is the room's "Your move").
    const clues = now.clues.slice(before.clues.length).map((c) => `${c.playerId === me ? 'Your' : `${name(c.playerId)}'s`} clue: ${c.word}.`)
    const next = now.turn.currentPlayerId
    const turn = next && next !== me && next !== before.turn.currentPlayerId ? `${name(next)}'s turn.` : null
    return [...clues, turn].filter(Boolean).join(' ') || null
  }
  if (now.phase === 'VOTING') return progressText(now.voted, before.voted, now.roundPlayers.length, (who) => `${who} voted`, me, name)
  if (now.phase === 'GUESS_CHECK' && now.result?.guess && !before.result?.guess) {
    return `${now.result.imposterId === me ? 'You' : name(now.result.imposterId)} guessed: ${now.result.guess}.`
  }
  return null
}
