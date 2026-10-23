/**
 * Tic-Tac-Toe: pure init / reduce / view. Nothing is hidden and nothing is timed,
 * so there are no timers and the secrets spec is empty.
 *
 * PLAYING -> RESULTS -> new_game -> PLAYING
 */
import { defineGame, gameError, type BaseCtx, type GameError, type PlayerId, type ReduceCtx, type Transition } from '@wsfg/core/contract'
import { addPoints, carryScores, nextTurnOrder, withoutPlayer } from '@wsfg/core/kit'
import {
  CELLS,
  clientActionSchema,
  defaultSettings,
  meta,
  PLAYERS,
  settingsSchema,
  type Cell,
  type ClientAction,
  type Mark,
  type Outcome,
  type Phase,
  type TicTacToeSettings,
  type TicTacToeView,
} from '../shared/index.ts'

// ---------------------------------------------------------------- state

export interface TicTacToeState {
  phase: Phase
  game: number
  /** [X, O]. Swapped each game, so the first move alternates. */
  order: PlayerId[]
  board: Cell[]
  turn: PlayerId | null
  outcome: Outcome | null
  winnerId: PlayerId | null
  line: number[] | null
  scores: Record<PlayerId, number>
}

type Ctx = BaseCtx<TicTacToeSettings>
type Step = Transition<TicTacToeState, never>

// ---------------------------------------------------------------- rules

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

/** The first full line of one mark, or null. */
export function winningLine(board: readonly Cell[]): number[] | null {
  return LINES.find(([a, b, c]) => board[a!] !== null && board[a!] === board[b!] && board[a!] === board[c!]) ?? null
}

function markOf(state: TicTacToeState, id: PlayerId): Mark | null {
  const i = state.order.indexOf(id)
  return i === 0 ? 'X' : i === 1 ? 'O' : null
}

// ---------------------------------------------------------------- transitions

function startGame(prev: TicTacToeState | null, ctx: Ctx): Step {
  const ids = ctx.players.map((p) => p.id)
  // 'rotate': random marks for the first game, then the players swap.
  const order = nextTurnOrder(prev?.order ?? null, ids, ctx.rng, 'rotate')
  return {
    state: {
      phase: 'PLAYING',
      game: (prev?.game ?? 0) + 1,
      order,
      board: Array<Cell>(CELLS).fill(null),
      turn: order[0]!,
      outcome: null,
      winnerId: null,
      line: null,
      scores: carryScores(prev?.scores, ids),
    },
  }
}

function finish(state: TicTacToeState, outcome: Outcome, winnerId: PlayerId | null, line: number[] | null): TicTacToeState {
  const scores = winnerId ? addPoints(state.scores, { [winnerId]: 1 }) : state.scores
  return { ...state, phase: 'RESULTS', turn: null, outcome, winnerId, line, scores }
}

// ---------------------------------------------------------------- reducer

function reduce(state: TicTacToeState, action: ClientAction, ctx: ReduceCtx<TicTacToeSettings>): Step | GameError {
  const actor = ctx.actorId

  switch (action.type) {
    case 'place': {
      if (state.phase !== 'PLAYING') return gameError('The game is over')
      if (actor !== state.turn) return gameError("It's not your turn")
      if (state.board[action.cell] !== null) return gameError('That square is taken')
      const board = state.board.with(action.cell, markOf(state, actor))
      const line = winningLine(board)
      if (line) return { state: finish({ ...state, board }, 'win', actor, line) }
      if (board.every((c) => c !== null)) return { state: finish({ ...state, board }, 'draw', null, null) }
      const turn = state.order.find((id) => id !== actor)!
      return { state: { ...state, board, turn } }
    }

    case 'new_game':
      if (actor !== ctx.hostId) return gameError('Only the host can start a new game')
      if (state.phase !== 'RESULTS') return gameError('The game is not over yet')
      if (ctx.players.length < PLAYERS) return gameError(`Need ${PLAYERS} players`)
      return startGame(state, ctx)
  }
}

// ---------------------------------------------------------------- view

function view(state: TicTacToeState, viewerId: PlayerId): TicTacToeView {
  const results = state.phase === 'RESULTS'
  return {
    phase: state.phase,
    game: state.game,
    you: { mark: markOf(state, viewerId) },
    marks: { X: state.order[0]!, O: state.order[1]! },
    board: state.board,
    turn: results ? null : state.turn,
    outcome: results ? state.outcome : null,
    winnerId: results ? state.winnerId : null,
    line: results ? state.line : null,
    scores: state.scores,
  }
}

// ---------------------------------------------------------------- module

export const ticTacToe = defineGame<TicTacToeState, ClientAction, never, TicTacToeView, TicTacToeSettings>({
  ...meta,
  settingsSchema,
  defaultSettings,
  actionSchema: clientActionSchema,

  init: (ctx) => startGame(null, ctx),
  reduce,
  view,

  // A player keeps their seat in `order` after leaving, so the final board still says whose marks were whose.
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
