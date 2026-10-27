import { assertValidGame } from '@ogn/core/contract'
import { describe, expect, it } from 'vitest'
import { dropLine, lineThrough } from '../server/game.ts'
import { BOARD_DIMENSIONS, BOARD_SIZES, LINE_LENGTHS, MAX_COLS, settingsSchema, type Disc } from '../shared/index.ts'
import { act, newGame, play } from './helpers.ts'

describe('module', () => {
  it('passes core registry checks', () => {
    expect(() => assertValidGame(dropLine)).not.toThrow()
  })

  it('every board fits the drop action and is bigger than its line', () => {
    for (const n of LINE_LENGTHS) {
      for (const size of BOARD_SIZES) {
        const { cols, rows } = BOARD_DIMENSIONS[n][size]
        expect(cols).toBeLessThanOrEqual(MAX_COLS)
        expect(Math.min(cols, rows)).toBeGreaterThanOrEqual(n)
      }
    }
  })

  it('accepts only the listed line lengths', () => {
    expect(settingsSchema.safeParse({ lineLength: 7, boardSize: 'small' }).success).toBe(false)
    expect(settingsSchema.safeParse({ lineLength: 5, boardSize: 'large' }).success).toBe(true)
  })
})

/** Columns (bottom first) from rows written top row first, '.' for empty. */
function board(...rows: string[]): Disc[][] {
  const cols = rows[0]!.length
  return Array.from({ length: cols }, (_, c) =>
    [...rows]
      .reverse()
      .map((row) => row[c])
      .filter((ch) => ch !== '.')
      .map((ch) => (ch === 'R' ? 'red' : 'blue')),
  )
}

describe('lineThrough', () => {
  it('finds lines in all four directions through the given disc', () => {
    const b = board(
      '...R.', //
      '..RB.',
      '.RBB.',
      'RBBBR',
    )
    expect(lineThrough(b, { col: 0, row: 0 }, 4)).toEqual([0, 1, 2, 3].map((i) => ({ col: i, row: i })))
    expect(lineThrough(b, { col: 1, row: 0 }, 3)).toEqual([1, 2, 3].map((col) => ({ col, row: 0 })))
    expect(lineThrough(b, { col: 3, row: 2 }, 3)).toEqual([0, 1, 2].map((row) => ({ col: 3, row })))
    expect(lineThrough(b, { col: 2, row: 1 }, 3)).toEqual([
      { col: 1, row: 0 },
      { col: 2, row: 1 },
      { col: 3, row: 2 },
    ])
    expect(lineThrough(b, { col: 2, row: 1 }, 4)).toBeNull()
    expect(lineThrough(b, { col: 4, row: 1 }, 1)).toBeNull()
  })

  it('finds anti-diagonals, and returns the whole of a line longer than needed', () => {
    const b = board(
      'R...', //
      'BR..',
      'BBR.',
      'BBBR',
    )
    expect(lineThrough(b, { col: 1, row: 2 }, 3)).toEqual([0, 1, 2, 3].map((col) => ({ col, row: 3 - col })))
  })
})

describe('a game', () => {
  it('builds the board from the settings, red to move, each player seeing their own disc', () => {
    const sim = newGame({ lineLength: 5, boardSize: 'large' })
    const [red, blue] = sim.state.order as [string, string]
    expect(sim.view(red)).toMatchObject({ phase: 'PLAYING', game: 1, cols: 10, rows: 8, lineLength: 5, you: { disc: 'red' }, turn: red })
    expect(sim.view(red).discs).toEqual({ red, blue })
    expect(sim.view(blue).you.disc).toBe('blue')
    expect(sim.view(blue).columns).toEqual(Array(10).fill([]))
  })

  it('drops discs to the bottom, alternates turns, and rejects bad drops', () => {
    const sim = newGame()
    const [red, blue] = sim.state.order as [string, string]
    expect(sim.act(blue, { type: 'drop', column: 3 })).toEqual({ ok: false, error: "It's not your turn" })
    expect(sim.act(red, { type: 'drop', column: 7 })).toEqual({ ok: false, error: 'There is no such column' })
    play(sim, [3, 3])
    expect(sim.view(red).columns[3]).toEqual(['red', 'blue'])
    expect(sim.view(red).last).toEqual({ col: 3, row: 1 })
    expect(sim.state.turn).toBe(red)
  })

  it('rejects a full column', () => {
    const sim = newGame()
    play(sim, [0, 0, 0, 0, 0, 0])
    expect(sim.act(sim.state.turn!, { type: 'drop', column: 0 })).toEqual({ ok: false, error: 'That column is full' })
  })

  it('a row wins a point and shows the line', () => {
    const sim = newGame()
    const [red, blue] = sim.state.order as [string, string]
    play(sim, [0, 0, 1, 1, 2, 2, 3])
    expect(sim.view(blue)).toMatchObject({ phase: 'RESULTS', outcome: 'win', winnerId: red, turn: null })
    expect(sim.view(blue).line).toEqual([0, 1, 2, 3].map((col) => ({ col, row: 0 })))
    expect(sim.state.scores).toEqual({ [red]: 1, [blue]: 0 })
    expect(sim.act(blue, { type: 'drop', column: 5 })).toEqual({ ok: false, error: 'The game is over' })
  })

  it('a column and a diagonal win', () => {
    const column = newGame()
    play(column, [0, 1, 0, 1, 0, 1, 0])
    expect(column.state.line).toEqual([0, 1, 2, 3].map((row) => ({ col: 0, row })))

    const diagonal = newGame()
    play(diagonal, [0, 1, 1, 2, 2, 3, 2, 3, 6, 3, 3])
    expect(diagonal.state).toMatchObject({ outcome: 'win', winnerId: diagonal.state.order[0] })
    expect(diagonal.state.line).toEqual([0, 1, 2, 3].map((i) => ({ col: i, row: i })))
  })

  it('the line length setting decides the win', () => {
    const sim = newGame({ lineLength: 3 })
    play(sim, [0, 0, 1, 1, 2])
    expect(sim.state.outcome).toBe('win')
    expect(sim.state.line).toHaveLength(3)
  })

  it('a full board with no line is a draw with no points', () => {
    const sim = newGame({ lineLength: 3, boardSize: 'small' })
    // Pairs of columns alternate, so no colour ever has three in a line.
    const disc = (c: number, r: number): Disc => ((Math.floor(c / 2) + r) % 2 === 0 ? 'red' : 'blue')
    const columns = Array.from({ length: 4 }, (_, c) => Array.from({ length: c === 3 ? 3 : 4 }, (_, r) => disc(c, r)))
    sim.state = { ...sim.state, columns, turn: sim.state.order[0]! }
    play(sim, [3])
    expect(sim.view('p1')).toMatchObject({ phase: 'RESULTS', outcome: 'draw', winnerId: null, line: null })
    expect(Object.values(sim.state.scores)).toEqual([0, 0])
  })
})

describe('next game', () => {
  it('only the host starts it, after the game; the players swap colours and scores carry', () => {
    const sim = newGame()
    const [red, blue] = sim.state.order as [string, string]
    expect(sim.act('p1', { type: 'new_game' })).toEqual({ ok: false, error: 'The game is not over yet' })
    play(sim, [0, 0, 1, 1, 2, 2, 3])
    expect(sim.act('p2', { type: 'new_game' })).toEqual({ ok: false, error: 'Only the host can start a new game' })
    act(sim, 'p1', { type: 'new_game' })
    expect(sim.state).toMatchObject({ phase: 'PLAYING', game: 2, order: [blue, red], turn: blue, outcome: null, line: null, last: null })
    expect(sim.state.columns.every((c) => c.length === 0)).toBe(true)
    expect(sim.state.scores[red]).toBe(1)
  })
})

describe('disconnects and leavers', () => {
  it("never skips a disconnected player's turn", () => {
    const sim = newGame()
    const red = sim.state.order[0]!
    sim.disconnect(red)
    sim.advance(60_000)
    expect(sim.state.turn).toBe(red)
  })

  it('a player leaving mid-game ends it with no points, and a newcomer plays the next game', () => {
    const sim = newGame()
    const [red, blue] = sim.state.order as [string, string]
    play(sim, [3])
    sim.remove(blue)
    expect(sim.state).toMatchObject({ phase: 'RESULTS', outcome: 'abandoned', winnerId: null })
    expect(sim.state.scores).toEqual({ [red]: 0 })
    expect(sim.noticesFor(red)).toEqual(['A player left, so the game ended without a winner.'])

    const host = sim.hostId
    expect(sim.act(host, { type: 'new_game' })).toEqual({ ok: false, error: 'Need 2 players' })
    sim.join({ id: 'p9' })
    expect(sim.view('p9').you.disc).toBeNull()
    act(sim, host, { type: 'new_game' })
    expect(sim.state.order).toEqual([red, 'p9'])
    expect(sim.view('p9').you.disc).toBe('blue')
  })

  it('a player leaving after the game keeps the result', () => {
    const sim = newGame()
    const [red, blue] = sim.state.order as [string, string]
    play(sim, [0, 0, 1, 1, 2, 2, 3])
    sim.remove(blue)
    expect(sim.state).toMatchObject({ outcome: 'win', winnerId: red })
    expect(sim.noticesFor(red)).toEqual([])
  })
})
