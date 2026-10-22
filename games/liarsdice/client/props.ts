import type { PlayViewProps } from '@wsfg/core/client'
import type { ClientAction, LiarsDiceView } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export type PhaseProps = PlayViewProps<LiarsDiceView, ClientAction>

const FACE_NAMES = ['one', 'two', 'three', 'four', 'five', 'six']

/** "4 fives", "1 six". */
export function bidText(bid: { quantity: number; face: number }): string {
  const name = FACE_NAMES[bid.face - 1]!
  return `${bid.quantity} ${bid.quantity === 1 ? name : name === 'six' ? 'sixes' : `${name}s`}`
}
