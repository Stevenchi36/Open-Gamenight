import type { RoomView } from '@ogn/core/protocol'
import type { DotsView } from '../shared/index.ts'

/** Whether the game is waiting on this viewer: their move, or the host's next game. */
export function needsAction(view: DotsView, me: string, room: RoomView): boolean {
  switch (view.phase) {
    case 'PLAYING':
      return view.turn === me
    case 'RESULTS':
      return me === room.hostId
  }
}
