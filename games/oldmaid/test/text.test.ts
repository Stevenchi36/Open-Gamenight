import { describe, expect, it } from 'vitest'
import { moveText, royaleStandings } from '../client/text.ts'
import type { Move, OldMaidView, Seat } from '../shared/index.ts'
import { cards } from './helpers.ts'

const name = (id: string) => id.toUpperCase()
const move = (m: Partial<Move>): Move => ({ drawerId: 'a', fromId: 'b', index: 0, card: null, pair: null, out: [], away: false, ...m })
const seat = (id: string, left = false): Seat => ({ id, cards: 0, pairs: 0, outPlace: null, inRound: true, eliminated: false, left })
const royale = (royaleOut: string[], royaleWinnerId: string | null, seats: Seat[]) => ({ royaleOut, royaleWinnerId, seats }) as OldMaidView

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

describe('royaleStandings', () => {
  it('places the winner first, then the Old Maids from the last caught to the first', () => {
    const v = royale(['b', 'c', 'd'], 'a', ['a', 'b', 'c', 'd'].map((id) => seat(id)))
    expect(royaleStandings(v, 'c', name)).toEqual([
      { id: 'a', name: 'A', place: 1, detail: 'Last one in' },
      { id: 'd', name: 'D', place: 2, detail: 'Old Maid in round 3' },
      { id: 'c', name: 'You', place: 3, detail: 'Old Maid in round 2' },
      { id: 'b', name: 'B', place: 4, detail: 'Old Maid in round 1' },
    ])
  })

  it('leaves out players who left, and is empty until the Royale is won', () => {
    const seats = [seat('a'), seat('b', true), seat('c')]
    expect(royaleStandings(royale(['b', 'c'], 'a', seats), 'a', name).map((s) => [s.id, s.place])).toEqual([
      ['a', 1],
      ['c', 2],
    ])
    expect(royaleStandings(royale(['b'], null, seats), 'a', name)).toEqual([])
  })
})
