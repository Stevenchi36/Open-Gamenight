import { describe, expect, it } from 'vitest'
import { bidRows } from '../client/text.ts'
import type { Bid, RoundResult } from '../shared/index.ts'

const name = (id: string) => id.toUpperCase()
const bids: Bid[] = [
  { playerId: 'a', quantity: 2, face: 3 },
  { playerId: 'b', quantity: 3, face: 5 },
]
const called = (over: Partial<RoundResult>): RoundResult => ({
  dice: {},
  bid: bids[1]!,
  callerId: 'c',
  call: 'liar',
  count: 2,
  loserId: 'b',
  gainerId: null,
  ...over,
})

describe('bidRows', () => {
  it('leaves every bid plain while bidding, even with an earlier round on record', () => {
    expect(bidRows({ phase: 'BIDDING', bids, lastRound: called({}) }, 'a', name)).toEqual([
      { text: 'You: 2 threes', tone: null },
      { text: 'B: 3 fives', tone: null },
    ])
  })

  it('marks a called lie red, then the caller green', () => {
    expect(bidRows({ phase: 'REVEAL', bids, lastRound: called({}) }, 'x', name)).toEqual([
      { text: 'A: 2 threes', tone: null },
      { text: 'B: 3 fives', tone: 'error' },
      { text: 'C called liar: there were 2.', tone: 'success' },
    ])
  })

  it('marks a bid that held green, and a wrong call red', () => {
    const rows = bidRows({ phase: 'RESULTS', bids, lastRound: called({ count: 4, loserId: 'c' }) }, 'c', name)
    expect(rows.slice(1)).toEqual([
      { text: 'B: 3 fives', tone: 'success' },
      { text: 'You called liar: there were 4.', tone: 'error' },
    ])
  })

  it('marks a right spot on green', () => {
    const rows = bidRows({ phase: 'REVEAL', bids, lastRound: called({ call: 'spot_on', count: 3, loserId: null, gainerId: 'c' }) }, 'x', name)
    expect(rows.slice(1)).toEqual([
      { text: 'B: 3 fives', tone: 'success' },
      { text: 'C called spot on: there were 3.', tone: 'success' },
    ])
  })
})
