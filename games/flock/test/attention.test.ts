import type { RoomView } from '@wsfg/core/protocol'
import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { act, answerAll, newGame, PLAYERS, type Sim } from './helpers.ts'

// needsAction reads only the host from the room.
const room = { hostId: 'p1' } as RoomView
const waitingOn = (sim: Sim, ids = PLAYERS) => ids.filter((id) => needsAction(sim.view(id), id, room))

describe('needsAction', () => {
  it('flags round players until they answer, never late joiners', () => {
    const sim = newGame()
    sim.join({ id: 'p9' })
    expect(waitingOn(sim, [...PLAYERS, 'p9'])).toEqual(PLAYERS)
    act(sim, 'p2', { type: 'submit_answer', text: 'Cheerios' })
    expect(waitingOn(sim)).toEqual(['p1', 'p3', 'p4'])
  })

  it('flags only the host while checking matches and on the results screen', () => {
    const sim = newGame()
    answerAll(sim, { p1: 'A', p2: 'A', p3: 'B', p4: 'C' })
    expect(sim.state.phase).toBe('REVIEW')
    expect(waitingOn(sim)).toEqual(['p1'])
    act(sim, 'p1', { type: 'score_round' })
    expect(waitingOn(sim)).toEqual(['p1'])
  })
})
