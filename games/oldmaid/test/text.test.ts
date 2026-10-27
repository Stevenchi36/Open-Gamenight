import { describe, expect, it } from 'vitest'
import { moveText } from '../client/text.ts'
import type { Move } from '../shared/index.ts'
import { cards } from './helpers.ts'

const name = (id: string) => id.toUpperCase()
const move = (m: Partial<Move>): Move => ({ drawerId: 'a', fromId: 'b', index: 0, card: null, pair: null, out: [], away: false, ...m })

describe('moveText', () => {
  it('names the card only when the viewer knows it', () => {
    expect(moveText(move({}), 'c', name)).toBe('A took a card from B.')
    expect(moveText(move({ card: cards('7H')[0]! }), 'a', name)).toBe('You took the 7♥ from B.')
    expect(moveText(move({ card: cards('7H')[0]! }), 'b', name)).toBe('A took the 7♥ from you.')
  })

  it('adds a pair, players going out and an away draw', () => {
    const pair = cards('7S', '7H') as [never, never]
    expect(moveText(move({ card: pair[1], pair, out: ['b'] }), 'c', name)).toBe('A took the 7♥ from B. Pair of sevens! B is out!')
    expect(moveText(move({ out: ['a'] }), 'a', name)).toBe("You took a card from B. You're out!")
    expect(moveText(move({ away: true }), 'c', name)).toBe('A took a card from B (drawn for them).')
  })
})
