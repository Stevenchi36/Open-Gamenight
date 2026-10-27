import { describe, expect, it } from 'vitest'
import { ownerPlace } from '../client/places.ts'
import { act, cards, newGame, setTable } from './helpers.ts'

describe('ownerPlace', () => {
  it('mirrors the fan: the drawer’s rightmost card is the owner’s leftmost', () => {
    expect([0, 1, 2, 3].map((i) => ownerPlace(4, i))).toEqual([3, 2, 1, 0])
    expect(ownerPlace(1, 0)).toBe(0)
  })

  it('takes the card the drawer tapped, as seen from across the table', () => {
    const sim = newGame()
    const [a] = setTable(sim, { hands: [['2S'], ['3S'], ['9S', '4S', 'KH']] })
    // c holds 9S 4S KH, left to right; facing c, a sees KH 4S 9S and taps the first.
    act(sim, a!, { type: 'draw', index: ownerPlace(3, 0) })
    expect(sim.state.log[0]!.card).toEqual(cards('KH')[0])
  })
})
