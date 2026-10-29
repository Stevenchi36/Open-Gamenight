import { describe, expect, it } from 'vitest'
import { moveText } from '../client/text.ts'
import { newGame, play, type Sim } from './helpers.ts'

const name = (id: string) => id.toUpperCase()

/** Draws the lines, then describes the last one as `viewer` hears it. */
function after(sim: Sim, specs: string[], viewer: string): string | null {
  const before = sim.view(viewer)
  play(sim, specs)
  return moveText(sim.view(viewer), before, viewer, name)
}

describe('moveText', () => {
  it('names whoever drew the line, and says "You" to them', () => {
    const sim = newGame()
    const first = sim.state.turn!
    const other = first === 'p1' ? 'p2' : 'p1'
    expect(after(sim, ['h0,0'], other)).toBe(`${name(first)} drew across from row 1, dot 1`)
    expect(after(sim, ['v0,0'], first)).toBe(`${name(other)} drew down from row 1, dot 1`)
    expect(after(sim, ['h1,0'], first)).toBe('You drew across from row 2, dot 1')
  })

  it('credits a box-closing line to the box owner and counts the boxes', () => {
    const sim = newGame()
    play(sim, ['h0,0', 'v0,0', 'h1,0'])
    const closer = sim.state.turn!
    expect(after(sim, ['v0,1'], closer)).toBe('You drew down from row 1, dot 2 and claimed a box')
  })

  it('says nothing when no new line arrived', () => {
    const sim = newGame()
    play(sim, ['h0,0'])
    const view = sim.view('p1')
    expect(moveText(view, view, 'p1', name)).toBeNull()
  })
})
