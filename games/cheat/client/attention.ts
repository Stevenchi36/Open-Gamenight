import type { RoomView } from '@wsfg/core/protocol'
import type { CheatView } from '../shared/index.ts'

/**
 * Whether the game is waiting on this viewer: their play, or the host's next game.
 * Never a play they could call: that cue would hint the play is worth calling.
 */
export function needsAction(view: CheatView, me: string, room: RoomView): boolean {
  switch (view.phase) {
    case 'PLAYING':
      return view.turn === me && view.stage === 'play'
    case 'RESULTS':
      return me === room.hostId
  }
}
