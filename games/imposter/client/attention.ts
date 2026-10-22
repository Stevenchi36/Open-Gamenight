import type { ImposterSettings, ImposterView } from '../shared/index.ts'

/**
 * Whether the game is waiting on this viewer. Host-only overrides (skip, force reveal)
 * don't count: the game isn't waiting on those.
 */
export function needsAction(view: ImposterView, me: string, hostId: string, clueMode: ImposterSettings['clueMode']): boolean {
  switch (view.phase) {
    case 'CLUES':
      return view.turn.currentPlayerId === me
    case 'VOTING':
      return view.roundPlayers.includes(me) && view.you.vote === null
    case 'GUESS_CHECK': {
      const r = view.result
      if (clueMode === 'spoken') return me === r?.imposterId || me === r?.judgeId
      // Typed: the imposter until the guess is sent, then the judge.
      return r?.guess == null ? me === r?.imposterId : me === r.judgeId
    }
    case 'RESULTS':
      return me === hostId
    case 'REVEAL':
      return false
  }
}
