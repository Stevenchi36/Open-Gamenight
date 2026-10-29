import { describe, expect, it } from 'vitest'
import type { InOrderView } from '../shared/index.ts'
import { announceText, movedCard } from '../client/announce.ts'

describe('movedCard', () => {
  it('finds the one card that moved, and where to', () => {
    expect(movedCard(['a', 'b', 'c', 'd'], ['b', 'c', 'a', 'd'])).toEqual({ id: 'a', to: 2 })
    expect(movedCard(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c'])).toEqual({ id: 'd', to: 0 })
  })

  it('takes either card of a swapped pair', () => {
    expect(movedCard(['a', 'b', 'c'], ['b', 'a', 'c'])).toEqual({ id: 'b', to: 0 })
  })

  it("doesn't read the echo of your own move, even as the other card of a swap", () => {
    const view = (order: string[]) =>
      ({ phase: 'ORDERING', round: 1, ready: [], roundPlayers: ['p1', 'p2'], line: order.map((id) => ({ id, playerId: 'p2', clue: id })) }) as unknown as InOrderView
    const before = view(['a', 'b', 'c'])
    const after = view(['b', 'a', 'c'])
    const name = (id: string) => id.toUpperCase()
    expect(announceText(after, before, 'p1', name)).toBe('b moved to 1 of 3.')
    expect(announceText(after, before, 'p1', name, (id, to) => id === 'a' && to === 1)).toBeNull()
  })

  it('gives up on two moves at once, and on no move', () => {
    expect(movedCard(['a', 'b', 'c', 'd'], ['b', 'a', 'd', 'c'])).toBeNull()
    expect(movedCard(['a', 'b'], ['a', 'b'])).toBeNull()
  })
})
