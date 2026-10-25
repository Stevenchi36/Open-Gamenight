import type { RoomView } from '@wsfg/core/protocol'
import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { act, clueAll, newGame, PLAYERS, readyAll, type Sim } from './helpers.ts'

// needsAction reads only the host from the room.
const room = { hostId: 'p1' } as RoomView
const waitingOn = (sim: Sim, ids = PLAYERS) => ids.filter((id) => needsAction(sim.view(id), id, room))

describe('needsAction', () => {
  it('flags round players until their numbers have clues, never late joiners', () => {
    const sim = newGame({ settings: { numbersEach: 2 } })
    sim.join({ id: 'p9' })
    expect(waitingOn(sim, [...PLAYERS, 'p9'])).toEqual(PLAYERS)
    act(sim, 'p2', { type: 'submit_clue', itemId: 'p2#0', text: 'a kitten' })
    expect(waitingOn(sim)).toEqual(PLAYERS)
    act(sim, 'p2', { type: 'submit_clue', itemId: 'p2#1', text: 'a shark' })
    // p2 is done for now: Ready waits until every card has a clue
    expect(waitingOn(sim)).toEqual(['p1', 'p3', 'p4'])
  })

  it('flags everyone not ready once every card has a clue, and clears again on a move', () => {
    const sim = newGame()
    clueAll(sim)
    expect(waitingOn(sim)).toEqual(PLAYERS)
    readyAll(sim, ['p1', 'p3'])
    expect(waitingOn(sim)).toEqual(['p2', 'p4'])
    act(sim, 'p2', { type: 'move_item', itemId: 'p1#0', to: 3 })
    expect(waitingOn(sim)).toEqual(PLAYERS)
  })

  it('flags only the host on the results screen', () => {
    const sim = newGame()
    act(sim, 'p1', { type: 'reveal_now' })
    expect(waitingOn(sim)).toEqual(['p1'])
  })
})
