import type { RoomView } from '@wsfg/core/protocol'
import type { LastCardView } from '../shared/index.ts'

/**
 * Whether the game is waiting on this viewer: their turn, or the host's next round. Not an
 * exposed player's missing call: the cue would remind them to call, which is the point.
 */
export function needsAction(view: LastCardView, me: string, room: RoomView): boolean {
  switch (view.phase) {
    case 'PLAYING':
      return view.turn === me
    case 'RESULTS':
      return me === room.hostId
  }
}
