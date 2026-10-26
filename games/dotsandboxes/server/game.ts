/**
 * Dots and Boxes: pure init / reduce / onTimer / view. Nothing is hidden, so the
 * secrets spec is empty; the only timer skips a disconnected player's turn.
 *
 * PLAYING -> RESULTS -> new_game -> PLAYING
 */
import {
  defineGame,
  gameError,
  type BaseCtx,
  type Effect,
  type GameError,
  type PlayerId,
  type ReduceCtx,
  type TimerCtx,
  type Transition,
} from '@wsfg/core/contract'
import { addPoints, carryScores, DISCONNECT_GRACE_MS, isConnected, nextTurnOrder, withoutPlayer } from '@wsfg/core/kit'
import {
  clientActionSchema,
  defaultSettings,
  meta,
  MIN_PLAYERS,
  settingsSchema,
  type ClientAction,
  type DotsSettings,
  type DotsView,
  type Line,
  type Outcome,
  type Phase,
} from '../shared/index.ts'

// ---------------------------------------------------------------- state

export interface DotsState {
  phase: Phase
  game: number
  /** From the settings at game start; settings only change in the lobby. */
  grid: number
  /** Turn order; the index is the seat's colour. Leavers keep their seat. */
  seats: PlayerId[]
  left: PlayerId[]
  h: boolean[][]
  v: boolean[][]
  boxes: (number | null)[][]
  last: Line | null
  turn: PlayerId | null
  /** Bumped on every turn, so a stale skip timer is a no-op. */
  turnSeq: number
  outcome: Outcome | null
  winnerIds: PlayerId[]
  scores: Record<PlayerId, number>
}

/** Scheduled by the game itself and handled by onTimer; clients can't send these. */
export type DotsTimer = { type: 'turn_skip'; game: number; turnSeq: number }

type Ctx = BaseCtx<DotsSettings>
type Step = Transition<DotsState, DotsTimer>
type Fx = Effect<DotsTimer>[]

const cancelSkip: Effect<DotsTimer> = { type: 'cancel', key: 'turn_skip' }

// ---------------------------------------------------------------- rules

function playing(state: DotsState): PlayerId[] {
  return state.seats.filter((id) => !state.left.includes(id))
}

/** With 2 in the game a skip would hand the other player two turns in a row, so it waits. */
const skips = (state: DotsState) => playing(state).length > MIN_PLAYERS

/** The next seat after `id` still in the game (wrapping round); `id` itself if nobody else is. */
function nextSeat(state: DotsState, id: PlayerId): PlayerId {
  const from = state.seats.indexOf(id)
  const n = state.seats.length
  for (let i = 1; i < n; i++) {
    const seat = state.seats[(from + i) % n]!
    if (!state.left.includes(seat)) return seat
  }
  return id
}

export function lineExists(grid: number, { dir, row, col }: Line): boolean {
  return dir === 'h' ? row <= grid && col < grid : row < grid && col <= grid
}

/** The boxes either side of a line, [row, col], whether on the board or not. */
function besideLine({ dir, row, col }: Line): [number, number][] {
  return dir === 'h'
    ? [
        [row - 1, col],
        [row, col],
      ]
    : [
        [row, col - 1],
        [row, col],
      ]
}

function isClosed(h: boolean[][], v: boolean[][], row: number, col: number): boolean {
  return !!(h[row]?.[col] && h[row + 1]?.[col] && v[row]?.[col] && v[row]?.[col + 1])
}

/** The boxes `line` closes once drawn into `h`/`v`: none, one or two. */
export function closedBy(h: boolean[][], v: boolean[][], line: Line): [number, number][] {
  return besideLine(line).filter(([row, col]) => isClosed(h, v, row, col))
}

const countBoxes = (boxes: (number | null)[][], seat: number) => boxes.flat().filter((b) => b === seat).length

const grid2d = <T>(rows: number, cols: number, value: T): T[][] => Array.from({ length: rows }, () => Array<T>(cols).fill(value))

// ---------------------------------------------------------------- transitions

function startGame(prev: DotsState | null, ctx: Ctx): Step {
  const ids = ctx.players.map((p) => p.id)
  // 'rotate': random seats for the first game, then the first turn (and red) moves on one seat.
  const seats = nextTurnOrder(prev?.seats ?? null, ids, ctx.rng, 'rotate')
  const grid = ctx.settings.grid
  const state: DotsState = {
    phase: 'PLAYING',
    game: (prev?.game ?? 0) + 1,
    grid,
    seats,
    left: [],
    h: grid2d(grid + 1, grid, false),
    v: grid2d(grid, grid + 1, false),
    boxes: grid2d<number | null>(grid, grid, null),
    last: null,
    turn: null,
    turnSeq: prev?.turnSeq ?? 0,
    outcome: null,
    winnerIds: [],
    scores: carryScores(prev?.scores, ids),
  }
  return enterTurn(state, seats[0]!, ctx)
}

function enterTurn(state: DotsState, playerId: PlayerId, ctx: Ctx, effects: Fx = []): Step {
  const next = { ...state, turn: playerId, turnSeq: state.turnSeq + 1 }
  effects.push(cancelSkip)
  if (skips(next) && !isConnected(ctx, playerId)) effects.push(scheduleTurnSkip(next, ctx))
  return { state: next, effects }
}

function scheduleTurnSkip(state: DotsState, ctx: Ctx): Effect<DotsTimer> {
  return {
    type: 'schedule',
    key: 'turn_skip',
    at: ctx.now + DISCONNECT_GRACE_MS,
    action: { type: 'turn_skip', game: state.game, turnSeq: state.turnSeq },
  }
}

/** Most boxes among the players still in wins; a tie shares the win. */
function finishGame(state: DotsState): Step {
  const counts = playing(state).map((id) => ({ id, boxes: countBoxes(state.boxes, state.seats.indexOf(id)) }))
  const most = Math.max(...counts.map((c) => c.boxes))
  const winnerIds = counts.filter((c) => c.boxes === most).map((c) => c.id)
  return {
    state: {
      ...state,
      phase: 'RESULTS',
      turn: null,
      outcome: 'win',
      winnerIds,
      scores: addPoints(state.scores, Object.fromEntries(winnerIds.map((id) => [id, 1]))),
    },
    effects: [cancelSkip],
  }
}

function abandonGame(state: DotsState, effects: Fx): Step {
  return {
    state: { ...state, phase: 'RESULTS', turn: null, outcome: 'abandoned', winnerIds: [] },
    effects: [...effects, cancelSkip],
  }
}

// ---------------------------------------------------------------- reducer

function reduce(state: DotsState, action: ClientAction, ctx: ReduceCtx<DotsSettings>): Step | GameError {
  const actor = ctx.actorId

  switch (action.type) {
    case 'draw': {
      if (state.phase !== 'PLAYING') return gameError('The game is over')
      if (actor !== state.turn) return gameError("It's not your turn")
      const line: Line = { dir: action.dir, row: action.row, col: action.col }
      if (!lineExists(state.grid, line)) return gameError('There is no such line')
      const lines = line.dir === 'h' ? state.h : state.v
      if (lines[line.row]![line.col]) return gameError('That line is already drawn')

      const drawn = lines.with(line.row, lines[line.row]!.with(line.col, true))
      const h = line.dir === 'h' ? drawn : state.h
      const v = line.dir === 'v' ? drawn : state.v
      const closed = closedBy(h, v, line)
      const seat = state.seats.indexOf(actor)
      const boxes = closed.reduce((b, [row, col]) => b.with(row, b[row]!.with(col, seat)), state.boxes)
      const next = { ...state, h, v, boxes, last: line }

      if (boxes.every((row) => row.every((b) => b !== null))) return finishGame(next)
      // Closing a box means drawing again.
      return enterTurn(next, closed.length > 0 ? actor : nextSeat(state, actor), ctx)
    }

    case 'new_game':
      if (actor !== ctx.hostId) return gameError('Only the host can start a new game')
      if (state.phase !== 'RESULTS') return gameError('The game is not over yet')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startGame(state, ctx)
  }
}

/** Stale timers are no-ops. */
function onTimer(state: DotsState, action: DotsTimer, ctx: TimerCtx<DotsSettings>): Step {
  if (state.phase !== 'PLAYING' || action.game !== state.game || action.turnSeq !== state.turnSeq) return { state }
  const skipped = state.turn
  if (skipped === null || isConnected(ctx, skipped) || !skips(state)) return { state }
  const name = ctx.players.find((p) => p.id === skipped)?.name ?? 'A player'
  return enterTurn(state, nextSeat(state, skipped), ctx, [
    { type: 'notice', to: 'all', message: `${name} lost connection, so their turn was skipped.` },
  ])
}

// ---------------------------------------------------------------- view

function view(state: DotsState, viewerId: PlayerId): DotsView {
  const results = state.phase === 'RESULTS'
  const seat = playing(state).includes(viewerId) ? state.seats.indexOf(viewerId) : -1
  return {
    phase: state.phase,
    game: state.game,
    grid: state.grid,
    you: { seat: seat >= 0 ? seat : null },
    seats: state.seats.map((id, i) => ({ id, boxes: countBoxes(state.boxes, i), left: state.left.includes(id) })),
    h: state.h,
    v: state.v,
    boxes: state.boxes,
    last: state.last,
    turn: results ? null : state.turn,
    outcome: results ? state.outcome : null,
    winnerIds: results ? state.winnerIds : [],
    scores: state.scores,
  }
}

// ---------------------------------------------------------------- module

export const dotsAndBoxes = defineGame<DotsState, ClientAction, DotsTimer, DotsView, DotsSettings>({
  ...meta,
  settingsSchema,
  defaultSettings,
  actionSchema: clientActionSchema,

  init: (ctx) => startGame(null, ctx),
  reduce,
  onTimer,
  view,

  onPlayerDisconnected(state, playerId, ctx) {
    if (state.phase === 'PLAYING' && state.turn === playerId && skips(state)) return { state, effects: [scheduleTurnSkip(state, ctx)] }
    return { state }
  },

  onPlayerReconnected(state, playerId) {
    if (state.phase === 'PLAYING' && state.turn === playerId) return { state, effects: [cancelSkip] }
    return { state }
  },

  // The seat and its boxes stay, so closed boxes stay closed and the final board says whose they were.
  onPlayerRemoved(state, playerId, ctx) {
    const scores = withoutPlayer(state.scores, playerId)
    if (!playing(state).includes(playerId)) return { state: { ...state, scores } }
    const next: DotsState = { ...state, scores, left: [...state.left, playerId] }
    if (state.phase !== 'PLAYING') return { state: next }

    if (playing(next).length < MIN_PLAYERS) {
      return abandonGame(next, [{ type: 'notice', to: 'all', message: 'Not enough players left to finish the game.' }])
    }
    const notice: Effect<DotsTimer> = { type: 'notice', to: 'all', message: 'A player left; their boxes stay on the board.' }
    if (state.turn === playerId) return enterTurn(next, nextSeat(state, playerId), ctx, [notice])
    // Down to 2 in the game: a pending skip no longer applies.
    return { state: next, effects: skips(next) ? [notice] : [notice, cancelSkip] }
  },

  // Everything is on the board for everyone.
  secrets: [],
})
