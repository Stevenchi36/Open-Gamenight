import type { RoomView } from '@ogn/core/protocol'
import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { newGame, PLAYERS, play, type Sim } from './helpers.ts'

// needsAction reads only the host from the room.
const room = { hostId: 'p1' } as RoomView
const waitingOn = (sim: Sim) => PLAYERS.filter((id) => needsAction(sim.view(id), id, room))

describe('needsAction', () => {
  it('flags only the player to move while playing', () => {
    const sim = newGame()
    expect(waitingOn(sim)).toEqual([sim.state.turn])
    play(sim, [3])
    expect(waitingOn(sim)).toEqual([sim.state.turn])
  })

  it('flags only the host on the results screen', () => {
    const sim = newGame()
    play(sim, [0, 0, 1, 1, 2, 2, 3])
    expect(waitingOn(sim)).toEqual(['p1'])
  })
})
