import { assertValidGame } from '@wsfg/core/contract'
import { describe, expect, it } from 'vitest'
import { ticTacToe, winningLine } from '../server/game.ts'
import type { Cell } from '../shared/index.ts'
import { act, newGame, play } from './helpers.ts'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(ticTacToe)).not.toThrow()
  })
})

describe('winningLine', () => {
  const board = (s: string): Cell[] => [...s].map((c) => (c === '.' ? null : (c as Cell)))

  it('finds rows, columns and diagonals of one mark', () => {
    expect(winningLine(board('XXXOO....'))).toEqual([0, 1, 2])
    expect(winningLine(board('XOXOXO...'))).toBeNull()
    expect(winningLine(board('.OX.OX..X'))).toEqual([2, 5, 8])
    expect(winningLine(board('O.X.OX..O'))).toEqual([0, 4, 8])
    expect(winningLine(board('XOXXOOOXX'))).toBeNull()
  })
})

describe('a game', () => {
  it('starts with an empty board, X to move, each player seeing their own mark', () => {
    const sim = newGame()
    const [x, o] = sim.state.order as [string, string]
    expect(sim.state.turn).toBe(x)
    expect(sim.view(x)).toMatchObject({ phase: 'PLAYING', game: 1, you: { mark: 'X' }, marks: { X: x, O: o }, turn: x })
    expect(sim.view(o).you.mark).toBe('O')
    expect(sim.view(x).board).toEqual(Array(9).fill(null))
  })

  it('alternates turns and rejects out-of-turn moves and taken squares', () => {
    const sim = newGame()
    const [x, o] = sim.state.order as [string, string]
    expect(sim.act(o, { type: 'place', cell: 4 })).toEqual({ ok: false, error: "It's not your turn" })
    act(sim, x, { type: 'place', cell: 4 })
    expect(sim.state.turn).toBe(o)
    expect(sim.act(o, { type: 'place', cell: 4 })).toEqual({ ok: false, error: 'That square is taken' })
    act(sim, o, { type: 'place', cell: 0 })
    expect(sim.view(x).board.slice(0, 5)).toEqual(['O', null, null, null, 'X'])
  })

  it('three in a row wins a point and shows the line', () => {
    const sim = newGame()
    const [x, o] = sim.state.order as [string, string]
    play(sim, [0, 3, 1, 4, 2])
    expect(sim.view(o)).toMatchObject({ phase: 'RESULTS', outcome: 'win', winnerId: x, line: [0, 1, 2], turn: null })
    expect(sim.state.scores).toEqual({ [x]: 1, [o]: 0 })
    expect(sim.act(o, { type: 'place', cell: 8 })).toEqual({ ok: false, error: 'The game is over' })
  })

  it('a full board with no line is a draw with no points', () => {
    const sim = newGame()
    play(sim, [0, 1, 2, 4, 3, 5, 7, 6, 8])
    expect(sim.view('p1')).toMatchObject({ phase: 'RESULTS', outcome: 'draw', winnerId: null, line: null })
    expect(Object.values(sim.state.scores)).toEqual([0, 0])
  })

  it('a win on the last square is a win, not a draw', () => {
    const sim = newGame()
    const x = sim.state.order[0]!
    play(sim, [0, 1, 2, 3, 4, 5, 7, 6, 8])
    expect(sim.state.board.every((c) => c !== null)).toBe(true)
    expect(sim.state).toMatchObject({ outcome: 'win', winnerId: x, line: [0, 4, 8] })
  })
})

describe('next game', () => {
  it('only the host starts it, after the game; the players swap marks and scores carry', () => {
    const sim = newGame()
    const [x, o] = sim.state.order as [string, string]
    expect(sim.act('p1', { type: 'new_game' })).toEqual({ ok: false, error: 'The game is not over yet' })
    play(sim, [0, 3, 1, 4, 2])
    expect(sim.act('p2', { type: 'new_game' })).toEqual({ ok: false, error: 'Only the host can start a new game' })
    act(sim, 'p1', { type: 'new_game' })
    expect(sim.state).toMatchObject({ phase: 'PLAYING', game: 2, order: [o, x], turn: o, outcome: null, line: null })
    expect(sim.state.board.every((c) => c === null)).toBe(true)
    expect(sim.state.scores[x]).toBe(1)
  })
})

describe('disconnects and leavers', () => {
  it("never skips a disconnected player's turn", () => {
    const sim = newGame()
    const x = sim.state.order[0]!
    sim.disconnect(x)
    sim.advance(60_000)
    expect(sim.state.turn).toBe(x)
  })

  it('a player leaving mid-game ends it with no points, and a newcomer plays the next game', () => {
    const sim = newGame()
    const [x, o] = sim.state.order as [string, string]
    play(sim, [4])
    sim.remove(o)
    expect(sim.state).toMatchObject({ phase: 'RESULTS', outcome: 'abandoned', winnerId: null })
    expect(sim.state.scores).toEqual({ [x]: 0 })
    expect(sim.noticesFor(x)).toEqual(['A player left, so the game ended without a winner.'])

    const host = sim.hostId
    expect(sim.act(host, { type: 'new_game' })).toEqual({ ok: false, error: 'Need 2 players' })
    sim.join({ id: 'p9' })
    expect(sim.view('p9').you.mark).toBeNull()
    act(sim, host, { type: 'new_game' })
    expect(sim.state.order).toEqual([x, 'p9'])
    expect(sim.view('p9').you.mark).toBe('O')
  })

  it('a player leaving after the game keeps the result', () => {
    const sim = newGame()
    const [x, o] = sim.state.order as [string, string]
    play(sim, [0, 3, 1, 4, 2])
    sim.remove(o)
    expect(sim.state).toMatchObject({ outcome: 'win', winnerId: x })
    expect(sim.noticesFor(x)).toEqual([])
  })
})
