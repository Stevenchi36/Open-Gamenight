import type { RoomView } from '@ogn/core/protocol'
import type { OldMaidView } from '../shared/index.ts'

/** Whether the game is waiting on this viewer: their draw, or the host's next round. */
export function needsAction(view: OldMaidView, me: string, room: RoomView): boolean {
  switch (view.phase) {
    case 'PLAYING':
      return view.turn === me
    case 'RESULTS':
      return me === room.hostId
  }
}
