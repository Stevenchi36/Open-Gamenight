import { describe, expect, it } from 'vitest'
import { announceText } from '../client/announce.ts'
import { act, answerAll, groupWith, newGame, type Sim } from './helpers.ts'

const name = (id: string) => id.toUpperCase()

/** Runs `step`, then returns what `viewer` hears for it (p1 hosts). */
function heard(sim: Sim, viewer: string, step: () => void): string | null {
  const before = sim.view(viewer)
  step()
  return announceText(sim.view(viewer), before, viewer, name, 'p1')
}

describe('announceText', () => {
  it('counts answers as they come in', () => {
    const sim = newGame()
    expect(heard(sim, 'p2', () => act(sim, 'p3', { type: 'submit_answer', text: 'Cheerios' }))).toBe('P3 answered, 1 of 4')
  })

  it("reads the host's merge and split, and where the flock stands", () => {
    const sim = newGame()
    answerAll(sim, { p1: 'Coco Pops', p2: 'Cocoa Pops', p3: 'Cheerios', p4: 'Cornflakes' })
    const coco = groupWith(sim, 'p1')
    const cocoa = groupWith(sim, 'p2')
    expect(heard(sim, 'p3', () => act(sim, 'p1', { type: 'merge_groups', from: cocoa, into: coco }))).toBe(
      'P1 merged Cocoa Pops into Coco Pops. The flock says Coco Pops so far (2 players).',
    )
    expect(heard(sim, 'p1', () => act(sim, 'p1', { type: 'split_group', group: coco }))).toBe(
      'You split Coco Pops. Everyone said something different: no flock.',
    )
  })
})
