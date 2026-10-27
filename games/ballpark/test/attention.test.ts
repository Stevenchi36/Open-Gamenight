import type { RoomView } from '@ogn/core/protocol'
import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { act, both, guessAll, newGame, PLAYERS, type Sim } from './helpers.ts'

// needsAction reads only the host from the room.
const room = { hostId: 'p1' } as RoomView
const waitingOn = (sim: Sim, ids = PLAYERS) => ids.filter((id) => needsAction(sim.view(id), id, room))

describe('needsAction', () => {
  it('flags round players until they guess, never late joiners', () => {
    const sim = newGame()
    sim.join({ id: 'p9' })
    expect(waitingOn(sim, [...PLAYERS, 'p9'])).toEqual(PLAYERS)
    act(sim, 'p2', { type: 'submit_guess', value: 1 })
    expect(waitingOn(sim)).toEqual(['p1', 'p3', 'p4'])
  })

  it('flags round players until they bet, then only the host on the results screen', () => {
    const sim = newGame()
    guessAll(sim, { p1: 1, p2: 2, p3: 3, p4: 4 })
    expect(waitingOn(sim)).toEqual(PLAYERS)
    act(sim, 'p3', { type: 'place_bets', bets: both('g0') })
    expect(waitingOn(sim)).toEqual(['p1', 'p2', 'p4'])
    act(sim, 'p1', { type: 'reveal_answer' })
    expect(waitingOn(sim)).toEqual(['p1'])
  })
})
