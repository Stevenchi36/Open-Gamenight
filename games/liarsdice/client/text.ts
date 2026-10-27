import type { PlayerId } from '@ogn/core/contract'
import type { LiarsDiceView } from '../shared/index.ts'
import { bidText } from './props.ts'

export interface BidRow {
  text: string
  tone: 'success' | 'error' | null
}

/**
 * This round's bids for the move list, oldest first. While bidding they're all plain: nobody knows
 * which are true, and colouring them would hint. Once called, the called bid is green if it held and
 * red if it didn't, and the call follows, green if it paid off for the caller.
 */
export function bidRows(view: Pick<LiarsDiceView, 'phase' | 'bids' | 'lastRound'>, me: PlayerId, name: (id: PlayerId) => string): BidRow[] {
  const who = (id: PlayerId) => (id === me ? 'You' : name(id))
  const rows: BidRow[] = view.bids.map((b) => ({ text: `${who(b.playerId)}: ${bidText(b)}`, tone: null }))
  const r = view.lastRound
  if (view.phase === 'BIDDING' || !r || rows.length === 0) return rows
  rows[rows.length - 1]!.tone = r.count >= r.bid.quantity ? 'success' : 'error'
  const call = r.call === 'liar' ? 'called liar' : 'called spot on'
  rows.push({
    text: `${who(r.callerId)} ${call}: there ${r.count === 1 ? 'was' : 'were'} ${r.count}.`,
    tone: r.loserId === r.callerId ? 'error' : 'success',
  })
  return rows
}
