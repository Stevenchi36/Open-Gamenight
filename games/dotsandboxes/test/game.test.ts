import { assertValidGame } from '@wsfg/core/contract'
import { describe, expect, it } from 'vitest'
import { closedBy, dotsAndBoxes, lineExists } from '../server/game.ts'
import { settingsSchema } from '../shared/index.ts'
import { act, allLines, line, newGame, play, type Sim } from './helpers.ts'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(dotsAndBoxes)).not.toThrow()
  })

  it('accepts only the listed grids', () => {
    expect(settingsSchema.safeParse({ grid: 2 }).success).toBe(false)
    expect(settingsSchema.safeParse({ grid: 8 }).success).toBe(false)
    expect(settingsSchema.safeParse({ grid: 7 }).success).toBe(true)
  })
})

describe('lines and boxes', () => {
  it('knows which lines are on a grid', () => {
    expect(lineExists(3, line('h3,2'))).toBe(true)
    expect(lineExists(3, line('h3,3'))).toBe(false)
    expect(lineExists(3, line('v2,3'))).toBe(true)
    expect(lineExists(3, line('v3,0'))).toBe(false)
  })

  it('finds the boxes a line closes, on either side', () => {
    const h = [
      [true, true],
      [true, true],
      [false, false],
    ]
    const v = [
      [true, true, true],
      [false, false, false],
    ]
    expect(closedBy(h, v, line('v0,1'))).toEqual([
      [0, 0],
      [0, 1],
    ])
    expect(closedBy(h, v, line('h0,1'))).toEqual([[0, 1]])
    expect(closedBy(h, v, line('h1,0'))).toEqual([[0, 0]])
    expect(closedBy(h, v, line('v1,0'))).toEqual([])
  })
})

describe('a game', () => {
  it('builds an empty grid from the settings, red (seat 0) to move', () => {
    const sim = newGame({ grid: 4 })
    const [first, second] = sim.state.seats as [string, string]
    expect(sim.view(first)).toMatchObject({ phase: 'PLAYING', game: 1, grid: 4, you: { seat: 0 }, turn: first, last: null })
    expect(sim.view(second).you.seat).toBe(1)
    expect(sim.view(first).seats).toEqual([
      { id: first, boxes: 0, left: false },
      { id: second, boxes: 0, left: false },
    ])
    expect(sim.view(first).h).toEqual(Array(5).fill(Array(4).fill(false)))
    expect(sim.view(first).v).toEqual(Array(4).fill(Array(5).fill(false)))
    expect(sim.view(first).boxes).toEqual(Array(4).fill(Array(4).fill(null)))
  })

  it('draws lines, passes the turn, and rejects bad lines', () => {
    const sim = newGame({ grid: 3 })
    const [first, second] = sim.state.seats as [string, string]
    expect(sim.act(second, { type: 'draw', ...line('h0,0') })).toEqual({ ok: false, error: "It's not your turn" })
    expect(sim.act(first, { type: 'draw', ...line('h0,3') })).toEqual({ ok: false, error: 'There is no such line' })
    expect(sim.act(first, { type: 'draw', ...line('v3,0') })).toEqual({ ok: false, error: 'There is no such line' })
    play(sim, ['h0,0'])
    expect(sim.view(second)).toMatchObject({ turn: second, last: line('h0,0') })
    expect(sim.view(second).h[0]).toEqual([true, false, false])
    expect(sim.act(second, { type: 'draw', ...line('h0,0') })).toEqual({ ok: false, error: 'That line is already drawn' })
    play(sim, ['v1,2'])
    expect(sim.view(first).v[1]).toEqual([false, false, true, false])
    expect(sim.state.turn).toBe(first)
  })

  it('closing a box claims it and draws again', () => {
    const sim = newGame({ grid: 3 })
    const second = sim.state.seats[1]!
    play(sim, ['h0,0', 'h1,0', 'v0,0', 'v0,1'])
    expect(sim.view(second).boxes[0]).toEqual([1, null, null])
    expect(sim.view(second).seats[1]!.boxes).toBe(1)
    expect(sim.state.turn).toBe(second)
  })

  it('one line can close two boxes', () => {
    const sim = newGame({ grid: 3 })
    const first = sim.state.seats[0]!
    // Seven lines: the first player draws the seventh.
    play(sim, ['h0,0', 'h1,0', 'v0,0', 'h0,1', 'h1,1', 'v0,2', 'v0,1'])
    expect(sim.state.boxes[0]).toEqual([0, 0, null])
    expect(sim.view(first).seats[0]!.boxes).toBe(2)
    expect(sim.state.turn).toBe(first)
  })

  it('the last line ends the game: most boxes wins a point', () => {
    const sim = newGame({ grid: 3 })
    const [first, second] = sim.state.seats as [string, string]
    // Box (2,2) is left; seat 0 has 4 of the other 8. Seat 1 closes it to make 5.
    nearlyFull(sim, (i) => (i < 4 ? 0 : 1), second)
    play(sim, ['v2,3'])
    expect(sim.view(first)).toMatchObject({ phase: 'RESULTS', outcome: 'win', winnerIds: [second], turn: null })
    expect(sim.state.scores).toEqual({ [first]: 0, [second]: 1 })
    expect(sim.act(first, { type: 'draw', ...line('h0,0') })).toEqual({ ok: false, error: 'The game is over' })
  })

  it('players tied for most boxes share the win', () => {
    const sim = newGame({ grid: 4 })
    const [first, second] = sim.state.seats as [string, string]
    // Seat 0 has 8 of 15; seat 1 closes the last box to tie.
    nearlyFull(sim, (i) => (i < 8 ? 0 : 1), second)
    play(sim, ['v3,4'])
    expect(sim.state.winnerIds).toEqual([first, second])
    expect(sim.state.scores).toEqual({ [first]: 1, [second]: 1 })
  })

  it('plays out a whole board', () => {
    const sim = newGame({ grid: 3 })
    play(sim, allLines(3))
    expect(sim.state.phase).toBe('RESULTS')
    const seats = sim.view('p1').seats
    expect(seats.reduce((n, s) => n + s.boxes, 0)).toBe(9)
    const most = Math.max(...seats.map((s) => s.boxes))
    expect(sim.state.winnerIds).toEqual(seats.filter((s) => s.boxes === most).map((s) => s.id))
  })
})

/**
 * Every line drawn except the last box's right side (bottom right), every other box owned by `owner(i)`,
 * and `turn` to move.
 */
function nearlyFull(sim: Sim, owner: (i: number) => number, turn: string): void {
  const grid = sim.state.grid
  const last = grid - 1
  sim.state = {
    ...sim.state,
    h: Array.from({ length: grid + 1 }, () => Array<boolean>(grid).fill(true)),
    v: Array.from({ length: grid }, (_, row) => Array.from({ length: grid + 1 }, (_, col) => !(row === last && col === grid))),
    boxes: Array.from({ length: grid }, (_, row) => Array.from({ length: grid }, (_, col) => (row === last && col === last ? null : owner(row * grid + col)))),
    turn,
  }
}

describe('next game', () => {
  it('only the host starts it, after the game; the first seat moves on and scores carry', () => {
    const sim = newGame({ grid: 3 }, ['p1', 'p2', 'p3'])
    const [a, b, c] = sim.state.seats as [string, string, string]
    expect(sim.act('p1', { type: 'new_game' })).toEqual({ ok: false, error: 'The game is not over yet' })
    play(sim, allLines(3))
    const scores = sim.state.scores
    expect(sim.act('p2', { type: 'new_game' })).toEqual({ ok: false, error: 'Only the host can start a new game' })
    act(sim, 'p1', { type: 'new_game' })
    expect(sim.state).toMatchObject({ phase: 'PLAYING', game: 2, seats: [b, c, a], turn: b, last: null, winnerIds: [], scores })
    expect(sim.state.boxes.flat().every((x) => x === null)).toBe(true)
  })
})

describe('more players', () => {
  it('the turn goes round every seat', () => {
    const sim = newGame({ grid: 3 }, ['p1', 'p2', 'p3', 'p4'])
    const seats = sim.state.seats
    const turns: string[] = []
    for (const spec of ['h0,0', 'h0,1', 'h0,2', 'h3,0', 'h3,1']) {
      turns.push(sim.state.turn!)
      play(sim, [spec])
    }
    expect(turns).toEqual([...seats, seats[0]])
    expect(sim.view(seats[3]!).you.seat).toBe(3)
  })

  it('accepts at most 4 players', () => {
    expect(dotsAndBoxes.maxPlayers).toBe(4)
  })
})

describe('disconnects and leavers', () => {
  it("with 2 players, never skips a disconnected player's turn", () => {
    const sim = newGame()
    const first = sim.state.seats[0]!
    sim.disconnect(first)
    sim.advance(60_000)
    expect(sim.state.turn).toBe(first)
  })

  it("with 3 or more, skips a disconnected player's turn after the grace", () => {
    const sim = newGame({}, ['p1', 'p2', 'p3'])
    const [a, b] = sim.state.seats as [string, string]
    sim.disconnect(a)
    sim.advance(14_000)
    expect(sim.state.turn).toBe(a)
    sim.advance(1_000)
    expect(sim.state.turn).toBe(b)
    expect(sim.noticesFor(b)).toEqual([`${a.toUpperCase()} lost connection, so their turn was skipped.`])
  })

  it('reconnecting in time keeps the turn; a turn reached while away waits only the grace', () => {
    const sim = newGame({}, ['p1', 'p2', 'p3'])
    const [a, b, c] = sim.state.seats as [string, string, string]
    sim.disconnect(a)
    sim.advance(10_000)
    sim.reconnect(a)
    sim.advance(60_000)
    expect(sim.state.turn).toBe(a)

    sim.disconnect(b)
    play(sim, ['h0,0'])
    expect(sim.state.turn).toBe(b)
    sim.advance(15_000)
    expect(sim.state.turn).toBe(c)
  })

  it('a leaver keeps their seat and boxes, is skipped, and can’t win', () => {
    const sim = newGame({ grid: 3 }, ['p1', 'p2', 'p3'])
    const [a, b, c] = sim.state.seats as [string, string, string]
    // b closes box (0,0) and draws again.
    play(sim, ['h0,0', 'h1,0', 'v0,0', 'h3,2', 'v0,1'])
    expect(sim.state.turn).toBe(b)
    sim.remove(b)
    expect(sim.state.turn).toBe(c)
    expect(sim.noticesFor(a)).toEqual(['A player left; their boxes stay on the board.'])
    expect(sim.view(a).seats[1]).toEqual({ id: b, boxes: 1, left: true })
    expect(sim.view(a).boxes[0]![0]).toBe(1)
    play(sim, ['h3,0'])
    expect(sim.state.turn).toBe(a)

    play(sim, allLines(3).filter((s) => !sim.state[s[0] as 'h' | 'v'][line(s).row]![line(s).col]))
    expect(sim.state.winnerIds).not.toContain(b)
    expect(Object.keys(sim.state.scores).sort()).toEqual([a, c].sort())
  })

  it('down to 2 players, a pending skip is cancelled and turns wait again', () => {
    const sim = newGame({}, ['p1', 'p2', 'p3'])
    const [a, , c] = sim.state.seats as [string, string, string]
    sim.disconnect(a)
    sim.remove(c)
    sim.advance(60_000)
    expect(sim.state.turn).toBe(a)
  })

  it('fewer than 2 left ends the game with no points', () => {
    const sim = newGame()
    const [first, second] = sim.state.seats as [string, string]
    play(sim, ['h0,0'])
    sim.remove(second)
    expect(sim.state).toMatchObject({ phase: 'RESULTS', outcome: 'abandoned', winnerIds: [] })
    expect(sim.state.scores).toEqual({ [first]: 0 })
    expect(sim.noticesFor(first)).toEqual(['Not enough players left to finish the game.'])
  })

  it('a late joiner watches, then plays the next game', () => {
    const sim = newGame({ grid: 3 })
    sim.join({ id: 'p9' })
    expect(sim.view('p9').you.seat).toBeNull()
    expect(sim.act('p9', { type: 'draw', ...line('h0,0') })).toEqual({ ok: false, error: "It's not your turn" })
    play(sim, allLines(3))
    act(sim, sim.hostId, { type: 'new_game' })
    expect(sim.state.seats).toHaveLength(3)
    expect(sim.view('p9').you.seat).toBe(2)
  })

  it('a player leaving after the game keeps the result', () => {
    const sim = newGame({ grid: 3 })
    play(sim, allLines(3))
    const winners = sim.state.winnerIds
    sim.remove(sim.state.seats[1]!)
    expect(sim.state).toMatchObject({ phase: 'RESULTS', outcome: 'win', winnerIds: winners })
  })
})
