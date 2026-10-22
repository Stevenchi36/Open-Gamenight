import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { REVEAL_MS } from '../shared/index.ts'
import { catchImposter, current, newGame, PLAYERS, playClues, type Sim } from './helpers.ts'

const waitingOn = (sim: Sim) => PLAYERS.filter((id) => needsAction(sim.view(id), id, 'p1'))

describe('needsAction', () => {
  it('flags only the player whose clue turn it is', () => {
    const sim = newGame()
    expect(waitingOn(sim)).toEqual([current(sim)])
  })

  it('flags players who have not voted yet', () => {
    const sim = newGame()
    playClues(sim)
    expect(waitingOn(sim)).toEqual(PLAYERS)
    sim.act('p2', { type: 'cast_vote', targetId: 'p3' })
    expect(waitingOn(sim)).toEqual(['p1', 'p3', 'p4'])
  })

  it('flags nobody during the reveal, then the imposter and judge during the guess', () => {
    const sim = newGame({ imposter: 'p3' })
    playClues(sim)
    catchImposter(sim)
    expect(waitingOn(sim)).toEqual([])
    sim.advance(REVEAL_MS)
    expect(sim.state.phase).toBe('GUESS_CHECK')
    expect(waitingOn(sim)).toEqual(['p1', 'p3'])
  })

  it('flags only the host on the results screen', () => {
    const sim = newGame({ imposter: 'p3', settings: { guessMode: 'off' } })
    playClues(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
    expect(sim.state.phase).toBe('RESULTS')
    expect(waitingOn(sim)).toEqual(['p1'])
  })
})
