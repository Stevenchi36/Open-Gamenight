import type { RoomView } from '@wsfg/core/protocol'
import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { act, newGame, PLAYERS, playCodes, setTable, waitOutCall, type Sim } from './helpers.ts'

// needsAction reads only the host from the room.
const room = { hostId: 'p1' } as RoomView
const waitingOn = (sim: Sim) => PLAYERS.filter((id) => needsAction(sim.view(id), id, room))

describe('needsAction', () => {
  it('flags the turn player once they may play, and nobody for a callable play', () => {
    const sim = newGame()
    expect(waitingOn(sim)).toEqual([sim.state.turn])
    const [a, b] = setTable(sim, { hands: [['AS', '9C'], ['2C'], ['3D']] })
    act(sim, a!, playCodes('A', '9C'))
    expect(waitingOn(sim)).toEqual([])
    waitOutCall(sim)
    expect(waitingOn(sim)).toEqual([b])
  })

  it('flags only the host on the results screen', () => {
    const sim = newGame()
    const [a] = setTable(sim, { hands: [['AS'], ['2C'], ['3D']] })
    act(sim, a!, playCodes('A', 'AS'))
    waitOutCall(sim)
    expect(sim.state.phase).toBe('RESULTS')
    expect(waitingOn(sim)).toEqual(['p1'])
  })
})
