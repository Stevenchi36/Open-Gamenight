import type { RoomView } from '@wsfg/core/protocol'
import { describe, expect, it } from 'vitest'
import { needsAction } from '../client/attention.ts'
import { act, booksExcept, newGame, PLAYERS, setTable, type Sim } from './helpers.ts'

// needsAction reads only the host from the room.
const room = { hostId: 'p1' } as RoomView
const waitingOn = (sim: Sim) => PLAYERS.filter((id) => needsAction(sim.view(id), id, room))

describe('needsAction', () => {
  it('flags only the player whose turn it is while playing', () => {
    const sim = newGame()
    expect(waitingOn(sim)).toEqual([sim.state.turn])
    const [a, b] = setTable(sim, { hands: [['7S'], ['KC'], ['2S']], pond: ['3C'] })
    act(sim, a!, { type: 'ask', targetId: b!, rank: '7' })
    expect(waitingOn(sim)).toEqual([b])
  })

  it('flags only the host on the results screen', () => {
    const sim = newGame()
    const [a, b] = setTable(sim, { hands: [['QS', 'QH'], ['QD', 'QC'], []], books: [booksExcept('Q'), [], []] })
    act(sim, a!, { type: 'ask', targetId: b!, rank: 'Q' })
    expect(sim.state.phase).toBe('RESULTS')
    expect(waitingOn(sim)).toEqual(['p1'])
  })
})
