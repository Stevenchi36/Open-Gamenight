import type { RoomView } from '@ogn/core/protocol'
import type { InOrderView } from '../shared/index.ts'

/**
 * Whether the game is waiting on this viewer: a clue for one of their numbers, or
 * their Ready once every card in the line has a clue; the host's next round.
 */
export function needsAction(view: InOrderView, me: string, room: RoomView): boolean {
  switch (view.phase) {
    case 'ORDERING':
      if (view.you.status !== 'playing') return false
      if (view.you.cards.some((c) => c.clue === null)) return true
      return view.line.every((c) => c.clue !== null) && !view.ready.includes(me)
    case 'RESULTS':
      return me === room.hostId
  }
}
