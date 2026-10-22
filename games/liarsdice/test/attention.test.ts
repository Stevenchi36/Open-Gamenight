import type { RoomView } from '@wsfg/core/protocol'
import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { REVEAL_MS } from '../shared/index.ts'
import { act, newGame, PLAYERS, setDice, type Sim } from './helpers.ts'

// needsAction reads only the host from the room.
const room = { hostId: 'p1' } as RoomView
const waitingOn = (sim: Sim) => PLAYERS.filter((id) => needsAction(sim.view(id), id, room))

describe('needsAction', () => {
  it('flags only the player whose turn it is while bidding', () => {
    const sim = newGame()
    expect(waitingOn(sim)).toEqual([sim.state.turn])
    act(sim, sim.state.turn!, { type: 'bid', quantity: 2, face: 3 })
    expect(waitingOn(sim)).toEqual([sim.state.turn])
  })

  it('flags nobody during the reveal, then only the host on the results screen', () => {
    const sim = newGame({ players: ['p1', 'p2'], settings: { startingDice: 1 } })
    const [a, b] = sim.state.seats as [string, string]
    setDice(sim, { [a]: [4], [b]: [2] })
    act(sim, a, { type: 'bid', quantity: 2, face: 4 })
    act(sim, b, { type: 'call' })
    expect(waitingOn(sim)).toEqual([])
    sim.advance(REVEAL_MS)
    expect(sim.state.phase).toBe('RESULTS')
    expect(waitingOn(sim)).toEqual(['p1'])
  })
})
