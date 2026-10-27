/**
 * Drop Line: pure init / reduce / view. Nothing is hidden and nothing is timed,
 * so there are no timers and the secrets spec is empty.
 *
 * PLAYING -> RESULTS -> new_game -> PLAYING
 */
import { defineGame, gameError, type BaseCtx, type GameError, type PlayerId, type ReduceCtx, type Transition } from '@ogn/core/contract'
import { addPoints, carryScores, nextTurnOrder, withoutPlayer } from '@ogn/core/kit'
import {
  BOARD_DIMENSIONS,
  clientActionSchema,
  defaultSettings,
  meta,
  PLAYERS,
  settingsSchema,
  type ClientAction,
  type Disc,
  type DropLineSettings,
  type DropLineView,
  type Outcome,
  type Phase,
  type Spot,
} from '../shared/index.ts'

// ---------------------------------------------------------------- state

export interface DropLineState {
  phase: Phase
  game: number
  /** From the settings at game start; settings only change in the lobby. */
  cols: number
  rows: number
  lineLength: number
  /** [red, blue]. Swapped each game, so the first move alternates. */
  order: PlayerId[]
  /** Per column, bottom first. */
  columns: Disc[][]
  last: Spot | null
  turn: PlayerId | null
  outcome: Outcome | null
  winnerId: PlayerId | null
  line: Spot[] | null
  scores: Record<PlayerId, number>
}

type Ctx = BaseCtx<DropLineSettings>
type Step = Transition<DropLineState, never>

// ---------------------------------------------------------------- rules

/** Across, up, and the two diagonals; each is also walked backwards. */
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const

/**
 * The longest line through `at` of the disc there, if it reaches `length`; else null.
 * Only lines through the newest disc can be new, so this is all a drop needs to check.
 */
export function lineThrough(columns: readonly Disc[][], at: Spot, length: number): Spot[] | null {
  const disc = columns[at.col]?.[at.row]
  if (!disc) return null
  const same = (col: number, row: number) => columns[col]?.[row] === disc
  let best: Spot[] = []
  for (const [dc, dr] of DIRECTIONS) {
    const line: Spot[] = [at]
    for (let c = at.col - dc, r = at.row - dr; same(c, r); c -= dc, r -= dr) line.unshift({ col: c, row: r })
    for (let c = at.col + dc, r = at.row + dr; same(c, r); c += dc, r += dr) line.push({ col: c, row: r })
    if (line.length > best.length) best = line
  }
  return best.length >= length ? best : null
}

function discOf(state: DropLineState, id: PlayerId): Disc | null {
  const i = state.order.indexOf(id)
  return i === 0 ? 'red' : i === 1 ? 'blue' : null
}

// ---------------------------------------------------------------- transitions

function startGame(prev: DropLineState | null, ctx: Ctx): Step {
  const ids = ctx.players.map((p) => p.id)
  // 'rotate': random colours for the first game, then the players swap.
  const order = nextTurnOrder(prev?.order ?? null, ids, ctx.rng, 'rotate')
  const { cols, rows } = BOARD_DIMENSIONS[ctx.settings.lineLength][ctx.settings.boardSize]
  return {
    state: {
      phase: 'PLAYING',
      game: (prev?.game ?? 0) + 1,
      cols,
      rows,
      lineLength: ctx.settings.lineLength,
      order,
      columns: Array.from({ length: cols }, () => []),
      last: null,
      turn: order[0]!,
      outcome: null,
      winnerId: null,
      line: null,
      scores: carryScores(prev?.scores, ids),
    },
  }
}

function finish(state: DropLineState, outcome: Outcome, winnerId: PlayerId | null, line: Spot[] | null): DropLineState {
  const scores = winnerId ? addPoints(state.scores, { [winnerId]: 1 }) : state.scores
  return { ...state, phase: 'RESULTS', turn: null, outcome, winnerId, line, scores }
}

// ---------------------------------------------------------------- reducer

function reduce(state: DropLineState, action: ClientAction, ctx: ReduceCtx<DropLineSettings>): Step | GameError {
  const actor = ctx.actorId

  switch (action.type) {
    case 'drop': {
      if (state.phase !== 'PLAYING') return gameError('The game is over')
      if (actor !== state.turn) return gameError("It's not your turn")
      const column = state.columns[action.column]
      if (!column) return gameError('There is no such column')
      if (column.length >= state.rows) return gameError('That column is full')
      const columns = state.columns.with(action.column, [...column, discOf(state, actor)!])
      const last = { col: action.column, row: column.length }
      const next = { ...state, columns, last }
      const line = lineThrough(columns, last, state.lineLength)
      if (line) return { state: finish(next, 'win', actor, line) }
      if (columns.every((c) => c.length >= state.rows)) return { state: finish(next, 'draw', null, null) }
      return { state: { ...next, turn: state.order.find((id) => id !== actor)! } }
    }

    case 'new_game':
      if (actor !== ctx.hostId) return gameError('Only the host can start a new game')
      if (state.phase !== 'RESULTS') return gameError('The game is not over yet')
      if (ctx.players.length < PLAYERS) return gameError(`Need ${PLAYERS} players`)
      return startGame(state, ctx)
  }
}

// ---------------------------------------------------------------- view

function view(state: DropLineState, viewerId: PlayerId): DropLineView {
  const results = state.phase === 'RESULTS'
  return {
    phase: state.phase,
    game: state.game,
    cols: state.cols,
    rows: state.rows,
    lineLength: state.lineLength,
    you: { disc: discOf(state, viewerId) },
    discs: { red: state.order[0]!, blue: state.order[1]! },
    columns: state.columns,
    last: state.last,
    turn: results ? null : state.turn,
    outcome: results ? state.outcome : null,
    winnerId: results ? state.winnerId : null,
    line: results ? state.line : null,
    scores: state.scores,
  }
}

// ---------------------------------------------------------------- module

export const dropLine = defineGame<DropLineState, ClientAction, never, DropLineView, DropLineSettings>({
  ...meta,
  settingsSchema,
  defaultSettings,
  actionSchema: clientActionSchema,

  init: (ctx) => startGame(null, ctx),
  reduce,
  view,

  // A player keeps their seat in `order` after leaving, so the final board still says whose discs were whose.
  onPlayerRemoved(state, playerId) {
    const next = { ...state, scores: withoutPlayer(state.scores, playerId) }
    if (state.phase !== 'PLAYING' || !state.order.includes(playerId)) return { state: next }
    return {
      state: finish(next, 'abandoned', null, null),
      effects: [{ type: 'notice', to: 'all', message: 'A player left, so the game ended without a winner.' }],
    }
  },

  // Everything is on the board for both players.
  secrets: [],
})
