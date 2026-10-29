import { describe, expect, it } from 'vitest'
import { moveRows, verdict } from '../client/text.ts'
import type { Bid, CalledRound, RoundResult } from '../shared/index.ts'

const name = (id: string) => id.toUpperCase()
const bids: Bid[] = [
  { playerId: 'a', quantity: 2, face: 3 },
  { playerId: 'b', quantity: 3, face: 5 },
]
const called = (over: Partial<CalledRound>): CalledRound => ({
  bids,
  callerId: 'c',
  call: 'liar',
  count: 2,
  loserId: 'b',
  gainerId: null,
  ...over,
})
const result = (over: Partial<RoundResult>): RoundResult => ({
  dice: {},
  bid: bids[1]!,
  callerId: 'c',
  call: 'liar',
  count: 2,
  loserId: 'b',
  gainerId: null,
  ...over,
})

describe('moveRows', () => {
  it('leaves the bids in play plain, after the earlier rounds of the match', () => {
    const next: Bid[] = [{ playerId: 'a', quantity: 1, face: 4 }]
    expect(moveRows({ phase: 'BIDDING', bids: next, history: [called({})] }, 'a', name)).toEqual([
      { text: 'You: 2 threes', tone: null },
      { text: 'B: 3 fives', tone: 'error' },
      { text: 'C called liar: there were 2, so B was bluffing.', tone: 'success' },
      { text: 'You: 1 four', tone: null },
    ])
  })

  it('shows a called round once, from its history entry, during the reveal', () => {
    expect(moveRows({ phase: 'REVEAL', bids, history: [called({})] }, 'x', name)).toHaveLength(3)
  })

  it('marks a bid that held green, and says the caller was wrong', () => {
    const rows = moveRows({ phase: 'RESULTS', bids, history: [called({ count: 4, loserId: 'c' })] }, 'c', name)
    expect(rows.slice(1)).toEqual([
      { text: 'B: 3 fives', tone: 'success' },
      { text: 'You called liar: there were 4, so B told the truth.', tone: 'error' },
    ])
  })

  it('marks a right spot on green and a wrong one red', () => {
    const right = moveRows({ phase: 'REVEAL', bids, history: [called({ call: 'spot_on', count: 3, loserId: null, gainerId: 'c' })] }, 'x', name)
    expect(right.at(-1)).toEqual({ text: 'C called spot on: there were exactly 3.', tone: 'success' })
    const wrong = moveRows({ phase: 'REVEAL', bids, history: [called({ call: 'spot_on', count: 4, loserId: 'c' })] }, 'x', name)
    expect(wrong.at(-1)).toEqual({ text: 'C called spot on: there were 4, not 3.', tone: 'error' })
  })
})

describe('verdict', () => {
  it('says the bidder told the truth when a liar call was wrong', () => {
    expect(verdict(result({ count: 3, loserId: 'c' }), 'x', name)).toEqual({
      overline: 'Not a liar!',
      title: 'B told the truth',
      text: 'C was wrong to call liar. C loses a die.',
    })
    expect(verdict(result({ count: 3, loserId: 'c' }), 'b', name).title).toBe('You told the truth')
    expect(verdict(result({ count: 3, loserId: 'c' }), 'c', name).text).toBe('You were wrong to call liar. You lose a die.')
  })

  it('calls out a bluff', () => {
    expect(verdict(result({}), 'b', name)).toEqual({ overline: 'Liar!', title: 'You were bluffing', text: 'C caught it. You lose a die.' })
  })

  it('reads spot on right or wrong', () => {
    expect(verdict(result({ call: 'spot_on', count: 3, loserId: null, gainerId: 'c' }), 'c', name)).toEqual({
      overline: 'Spot on!',
      title: 'You called it exactly',
      text: 'There were exactly 3. You get a die back.',
    })
    expect(verdict(result({ call: 'spot_on', count: 1, loserId: 'c' }), 'x', name)).toEqual({
      overline: 'Not spot on',
      title: 'C was off',
      text: 'There was 1, not 3. C loses a die.',
    })
  })
})
