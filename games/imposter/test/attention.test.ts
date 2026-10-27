import type { RoomView } from '@ogn/core/protocol'
import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { REVEAL_MS } from '../shared/index.ts'
import { catchImposter, current, newGame, PLAYERS, playClues, playSpoken, type Sim } from './helpers.ts'

// needsAction reads only the host from the room; settings come in typed.
const room = { hostId: 'p1' } as RoomView
const waitingOn = (sim: Sim) => PLAYERS.filter((id) => needsAction(sim.view(id), id, room, sim.state.settings))

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

  it('typed: flags nobody during the reveal, then the imposter until the guess is sent, then the judge', () => {
    const sim = newGame({ imposter: 'p3' })
    playClues(sim)
    catchImposter(sim)
    expect(waitingOn(sim)).toEqual([])
    sim.advance(REVEAL_MS)
    expect(sim.state.phase).toBe('GUESS_CHECK')
    expect(waitingOn(sim)).toEqual(['p3'])
    sim.act('p3', { type: 'submit_guess', word: 'penguin' })
    expect(waitingOn(sim)).toEqual(['p1'])
  })

  it('spoken: flags the imposter and the judge together during the guess', () => {
    const sim = newGame({ imposter: 'p3', settings: { clueMode: 'spoken' } })
    playSpoken(sim)
    catchImposter(sim)
    sim.advance(REVEAL_MS)
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
