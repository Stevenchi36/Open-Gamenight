import type { RoomView } from '@wsfg/core/protocol'
import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { drawCard, newGame, PLAYERS, setTable, type Sim } from './helpers.ts'

// needsAction reads only the host from the room.
const room = { hostId: 'p1' } as RoomView
const waitingOn = (sim: Sim) => PLAYERS.filter((id) => needsAction(sim.view(id), id, room))

describe('needsAction', () => {
  it('flags only the player whose turn it is while playing', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['2S'], ['3S'], ['4S', '5S']] })
    expect(waitingOn(sim)).toEqual([a])
    drawCard(sim)
    expect(waitingOn(sim)).toEqual([b])
  })

  it('flags only the host on the results screen', () => {
    const sim = newGame({ settings: { arrange: true } })
    setTable(sim, { hands: [['7S'], ['QS'], ['7H']] })
    drawCard(sim)
    expect(sim.state.phase).toBe('RESULTS')
    expect(waitingOn(sim)).toEqual(['p1'])
  })
})
