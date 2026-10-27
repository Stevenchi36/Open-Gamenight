import type { RoomView } from '@ogn/core/protocol'
import type { GoneFishinView } from '../shared/index.ts'

/** Whether the game is waiting on this viewer: their ask, or the host's next game. */
export function needsAction(view: GoneFishinView, me: string, room: RoomView): boolean {
  switch (view.phase) {
    case 'PLAYING':
      return view.turn === me
    case 'RESULTS':
      return me === room.hostId
  }
}
