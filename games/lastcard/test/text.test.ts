import { describe, expect, it } from 'vitest'
import { cardName, moveText } from '../client/text.ts'
import { card } from './helpers.ts'

const name = (id: string) => id.toUpperCase()

describe('cardName', () => {
  it('names coloured cards with their colour, wilds alone', () => {
    expect(cardName(card('r7'))).toBe('red 7')
    expect(cardName(card('bS'))).toBe('blue Skip')
    expect(cardName(card('y+2'))).toBe('yellow Draw Two')
    expect(cardName(card('W+4'))).toBe('Wild Draw Four')
  })
})

describe('moveText', () => {
  const play = { kind: 'play' as const, playerId: 'a', card: card('r7'), color: 'red' as const, jumpIn: false, swapWith: null, called: false }

  it('describes plays, from either side', () => {
    expect(moveText(play, 'c', name, false)).toBe('A played a red 7.')
    expect(moveText({ ...play, called: true }, 'a', name, false)).toBe('You played a red 7. Last card!')
    expect(moveText({ ...play, card: card('W'), color: 'blue' }, 'c', name, false)).toBe('A played a Wild and chose blue.')
    expect(moveText({ ...play, jumpIn: true }, 'c', name, false)).toBe('A jumped in with a red 7.')
  })

  it('describes 7-0 swaps', () => {
    expect(moveText({ ...play, swapWith: 'b' }, 'b', name, true)).toBe('A played a red 7. Swapped hands with you.')
    expect(moveText({ ...play, card: card('g0'), color: 'green' }, 'c', name, true)).toBe('A played a green 0. Every hand moved on.')
    expect(moveText({ ...play, card: card('g0'), color: 'green' }, 'c', name, false)).toBe('A played a green 0.')
  })

  it('describes draws, keeps, calls and catches', () => {
    const draw = { kind: 'draw' as const, playerId: 'a', count: 1, penalty: false, away: false }
    expect(moveText(draw, 'c', name, false)).toBe('A drew 1 card.')
    expect(moveText({ ...draw, count: 4, penalty: true }, 'a', name, false)).toBe('You had to draw 4 cards.')
    expect(moveText({ ...draw, count: 0 }, 'c', name, false)).toBe('A had nothing left to draw.')
    expect(moveText({ ...draw, away: true }, 'c', name, false)).toBe('A was away, so drew 1 card.')
    expect(moveText({ ...draw, count: 0, away: true }, 'a', name, false)).toBe('You were away, and there was nothing left to draw.')
    expect(moveText({ kind: 'pass', playerId: 'a', away: false }, 'c', name, false)).toBe('A kept the card.')
    expect(moveText({ kind: 'call', playerId: 'a' }, 'c', name, false)).toBe('A called Last card! just in time.')
    expect(moveText({ kind: 'catch', playerId: 'b', targetId: 'a', count: 2 }, 'a', name, false)).toBe('B caught you without a Last card! call: 2 cards.')
  })
})
