import type { RoomView } from '@ogn/core/protocol'
import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { newGame, PLAYERS, playCode, setTable, type Sim } from './helpers.ts'

// needsAction reads only the host from the room.
const room = { hostId: 'p1' } as RoomView
const waitingOn = (sim: Sim) => PLAYERS.filter((id) => needsAction(sim.view(id), id, room))

describe('needsAction', () => {
  it('flags only the player whose turn it is while playing, not an exposed player', () => {
    const sim = newGame()
    expect(waitingOn(sim)).toEqual([sim.state.turn])
    const [a, b] = setTable(sim, { hands: [['r9', 'g6'], ['r1'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r9')
    expect(sim.state.exposed).toBe(a)
    expect(waitingOn(sim)).toEqual([b])
  })

  it('flags only the host on the results screen', () => {
    const sim = newGame()
    const [a] = setTable(sim, { hands: [['r9'], ['r1'], ['y1']], top: 'r5' })
    playCode(sim, a!, 'r9')
    expect(sim.state.phase).toBe('RESULTS')
    expect(waitingOn(sim)).toEqual(['p1'])
  })
})
