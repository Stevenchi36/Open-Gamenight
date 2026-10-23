import type { RoomView } from '@wsfg/core/protocol'
import type { HerdView } from '../shared/index.ts'

/** Whether the game is waiting on this viewer: their answer, or the host's check, score or next round. */
export function needsAction(view: HerdView, me: string, room: RoomView): boolean {
  switch (view.phase) {
    case 'ANSWERING':
      return view.you.status === 'playing' && view.you.answer === null
    case 'REVIEW':
    case 'RESULTS':
      return me === room.hostId
  }
}
