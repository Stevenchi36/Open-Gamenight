import type { RoomView } from '@ogn/core/protocol'
import type { ColorMixView } from '../shared/index.ts'

/** Whether the game is waiting on this viewer: their guess, or the host's next round. */
export function needsAction(view: ColorMixView, me: string, room: RoomView): boolean {
  switch (view.phase) {
    case 'GUESSING':
      return view.you.status === 'playing' && view.you.guess === null
    case 'RESULTS':
      return me === room.hostId
  }
}
