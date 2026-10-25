import { describe, expect, it } from 'vitest'
import { moveText } from '../client/text.ts'
import type { Move } from '../shared/index.ts'

const name = (id: string) => id.toUpperCase()
const move = (m: Partial<Move>): Move => ({ askerId: 'a', targetId: 'b', rank: '7', given: 0, drew: true, lucky: false, books: [], ...m })

describe('moveText', () => {
  it('describes a hit, from either side', () => {
    expect(moveText(move({ given: 2, drew: false }), 'c', name)).toBe('A asked B for sevens and got two.')
    expect(moveText(move({ given: 1, drew: false }), 'a', name)).toBe('You asked B for sevens and got one.')
    expect(moveText(move({ given: 3, drew: false, books: ['7'] }), 'b', name)).toBe('A asked you for sevens and got three. Book of sevens!')
  })

  it('describes fishing, a lucky catch and an empty pond', () => {
    expect(moveText(move({}), 'c', name)).toBe("A asked B for sevens. Gone fishin'!")
    expect(moveText(move({ lucky: true }), 'c', name)).toBe("A asked B for sevens. Gone fishin'… and caught a seven!")
    expect(moveText(move({ drew: false }), 'c', name)).toBe("A asked B for sevens. Gone fishin', but the pond is empty.")
  })

  it('describes a forced draw', () => {
    expect(moveText(move({ targetId: null, rank: null }), 'c', name)).toBe('A had nobody to ask, so they drew from the pond.')
    expect(moveText(move({ targetId: null, rank: null }), 'a', name)).toBe('You had nobody to ask, so you drew from the pond.')
  })
})
