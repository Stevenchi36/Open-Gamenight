import type { RoomView } from '@wsfg/core/protocol'
import type { BallparkView } from '../shared/index.ts'

/** Whether the game is waiting on this viewer: their guess, their bets, or the host's next round. */
export function needsAction(view: BallparkView, me: string, room: RoomView): boolean {
  switch (view.phase) {
    case 'GUESSING':
      return view.you.status === 'playing' && view.you.guess === null
    case 'BETTING':
      return view.you.status === 'playing' && view.you.bets.length === 0
    case 'RESULTS':
      return me === room.hostId
  }
}
