import type { RoomView } from '@wsfg/core/protocol'
import type { LiarsDiceView } from '../shared/index.ts'

/** Whether the game is waiting on this viewer: their bid or call, or the host's next match. */
export function needsAction(view: LiarsDiceView, me: string, room: RoomView): boolean {
  switch (view.phase) {
    case 'BIDDING':
      return view.turn === me
    case 'RESULTS':
      return me === room.hostId
    case 'REVEAL':
      return false
  }
}
