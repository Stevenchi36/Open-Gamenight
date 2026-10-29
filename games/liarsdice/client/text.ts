import type { PlayerId } from '@ogn/core/contract'
import type { CalledRound, LiarsDiceView, RoundResult } from '../shared/index.ts'
import { bidText } from './props.ts'

export interface BidRow {
  text: string
  tone: 'success' | 'error' | null
}

type Call = Pick<RoundResult, 'bid' | 'callerId' | 'call' | 'count' | 'gainerId'>

/** Whether the call paid off for the caller: a lie caught, or spot on exactly right. */
export function callWon(r: Call): boolean {
  return r.call === 'liar' ? r.count < r.bid.quantity : r.count === r.bid.quantity
}

/**
 * How a call went, for the reveal's status card, from the viewer's side. It names who was right:
 * a bid that held says the bidder told the truth and the caller was wrong, not "Liar!".
 */
export function verdict(r: Call, me: PlayerId, name: (id: PlayerId) => string): { overline: string; title: string; text: string } {
  const who = (id: PlayerId) => (id === me ? 'You' : name(id))
  const was = (id: PlayerId) => (id === me ? 'were' : 'was')
  const caller = who(r.callerId)
  const bidder = who(r.bid.playerId)
  const loses = (id: PlayerId) => `${who(id)} ${id === me ? 'lose' : 'loses'} a die.`
  if (r.call === 'liar') {
    if (!callWon(r)) {
      return {
        overline: 'Not a liar!',
        title: `${bidder} told the truth`,
        text: `${caller} ${was(r.callerId)} wrong to call liar. ${loses(r.callerId)}`,
      }
    }
    return { overline: 'Liar!', title: `${bidder} ${was(r.bid.playerId)} bluffing`, text: `${caller} caught it. ${loses(r.bid.playerId)}` }
  }
  if (callWon(r)) {
    const back = r.gainerId ? ` ${caller} ${r.callerId === me ? 'get' : 'gets'} a die back.` : ''
    return { overline: 'Spot on!', title: `${caller} called it exactly`, text: `There ${r.count === 1 ? 'was' : 'were'} exactly ${r.count}.${back}` }
  }
  return { overline: 'Not spot on', title: `${caller} ${was(r.callerId)} off`, text: `There ${r.count === 1 ? 'was' : 'were'} ${r.count}, not ${r.bid.quantity}. ${loses(r.callerId)}` }
}

/**
 * The match's moves for the move list, oldest first: each called round's bids and its call, then
 * this round's bids. Bids still in play are all plain: nobody knows which are true, and colouring
 * them would hint. In a called round the called bid is green if it held and red if it didn't, and
 * the call follows, green if it paid off for the caller and saying who was right.
 */
export function moveRows(view: Pick<LiarsDiceView, 'phase' | 'bids' | 'history'>, me: PlayerId, name: (id: PlayerId) => string): BidRow[] {
  const who = (id: PlayerId) => (id === me ? 'You' : name(id))
  const bidRow = (b: CalledRound['bids'][number]): BidRow => ({ text: `${who(b.playerId)}: ${bidText(b)}`, tone: null })
  const rows: BidRow[] = []
  for (const r of view.history) {
    const bid = r.bids.at(-1)!
    rows.push(...r.bids.slice(0, -1).map(bidRow), { ...bidRow(bid), tone: r.count >= bid.quantity ? 'success' : 'error' })
    const there = `there ${r.count === 1 ? 'was' : 'were'} ${r.count}`
    const was = (id: PlayerId) => `${who(id)} ${id === me ? 'were' : 'was'}`
    const outcome =
      r.call === 'liar'
        ? r.count >= bid.quantity
          ? `${there}, so ${who(bid.playerId)} told the truth.`
          : `${there}, so ${was(bid.playerId)} bluffing.`
        : r.count === bid.quantity
          ? `there ${r.count === 1 ? 'was' : 'were'} exactly ${r.count}.`
          : `${there}, not ${bid.quantity}.`
    rows.push({
      text: `${who(r.callerId)} called ${r.call === 'liar' ? 'liar' : 'spot on'}: ${outcome}`,
      tone: callWon({ ...r, bid }) ? 'success' : 'error',
    })
  }
  if (view.phase === 'BIDDING') rows.push(...view.bids.map(bidRow))
  return rows
}
