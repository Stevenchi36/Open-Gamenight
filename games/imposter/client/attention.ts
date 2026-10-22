import type { ImposterView } from '../shared/index.ts'

/**
 * Whether the game is waiting on this viewer. Host-only overrides (skip, force reveal)
 * don't count: the game isn't waiting on those.
 */
export function needsAction(view: ImposterView, me: string, hostId: string): boolean {
  switch (view.phase) {
    case 'CLUES':
      return view.turn.currentPlayerId === me
    case 'VOTING':
      return view.roundPlayers.includes(me) && view.you.vote === null
    case 'GUESS_CHECK':
      return me === view.result?.imposterId || me === view.result?.judgeId
    case 'RESULTS':
      return me === hostId
    case 'REVEAL':
      return false
  }
}
