import { describe, expect, it } from 'vitest'
import { claimsText, claimText, moveText, standings } from '../client/text.ts'
import type { CheatView, Move } from '../shared/index.ts'

const name = (id: string) => id.toUpperCase()

describe('claimText', () => {
  it('counts the cards and names the rank', () => {
    expect(claimText(2, '7')).toBe('two sevens')
    expect(claimText(1, 'A')).toBe('one ace')
    expect(claimText(4, '6')).toBe('four sixes')
  })

  it('lists the ranks a play may claim', () => {
    expect(claimsText(['8'])).toBe('eights')
    expect(claimsText(['6', '7', '8'])).toBe('sixes, sevens or eights')
    expect(claimsText(['A', '2', '3', '4'])).toBe('any rank')
  })
})

describe('moveText', () => {
  it('describes a play and a skip, from either side', () => {
    expect(moveText({ kind: 'play', playerId: 'a', count: 2, claim: '7' }, 'c', name)).toBe('A played two sevens.')
    expect(moveText({ kind: 'play', playerId: 'a', count: 1, claim: 'K' }, 'a', name)).toBe('You played one king.')
    expect(moveText({ kind: 'skip', playerId: 'a' }, 'c', name)).toBe('A was away, so their turn passed.')
    expect(moveText({ kind: 'skip', playerId: 'a' }, 'a', name)).toBe('You were away, so your turn passed.')
  })

  it('describes a call, caught or not', () => {
    const call: Move = { kind: 'call', callerId: 'b', playerId: 'a', count: 2, claim: '7', cards: [], lied: true, pickerId: 'a', picked: 9 }
    expect(moveText(call, 'c', name)).toBe("B called Cheat on A's two sevens: a lie! A picks up the pile (9 cards).")
    expect(moveText(call, 'a', name)).toBe('B called Cheat on your two sevens: a lie! You pick up the pile (9 cards).')
    expect(moveText({ ...call, lied: false, pickerId: 'b', picked: 1 }, 'b', name)).toBe(
      "You called Cheat on A's two sevens: all true. You pick up the pile (1 card).",
    )
  })
})

describe('standings', () => {
  it('places by fewest cards left, ties sharing a place, and leaves out leavers', () => {
    const seats = [
      { id: 'a', cards: 3, left: false },
      { id: 'b', cards: 0, left: false },
      { id: 'c', cards: 3, left: false },
      { id: 'd', cards: 1, left: true },
    ]
    expect(standings({ seats } as CheatView, 'c', name)).toEqual([
      { id: 'b', name: 'B', place: 1, detail: 'Out of cards' },
      { id: 'a', name: 'A', place: 2, detail: '3 cards left' },
      { id: 'c', name: 'You', place: 2, detail: '3 cards left' },
    ])
  })
})
