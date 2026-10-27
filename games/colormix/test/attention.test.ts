import type { RoomView } from '@ogn/core/protocol'
import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { act, newGame, PLAYERS, type Sim } from './helpers.ts'

// needsAction reads only the host from the room.
const room = { hostId: 'p1' } as RoomView
const waitingOn = (sim: Sim, ids = PLAYERS) => ids.filter((id) => needsAction(sim.view(id), id, room))

describe('needsAction', () => {
  it('flags round players until they guess, never late joiners', () => {
    const sim = newGame()
    sim.join({ id: 'p9' })
    expect(waitingOn(sim, [...PLAYERS, 'p9'])).toEqual(PLAYERS)
    act(sim, 'p2', { type: 'submit_guess', color: '#123456' })
    expect(waitingOn(sim)).toEqual(['p1', 'p3', 'p4'])
  })

  it('flags only the host on the results screen', () => {
    const sim = newGame()
    act(sim, 'p1', { type: 'reveal_guesses' })
    expect(waitingOn(sim)).toEqual(['p1'])
  })
})
