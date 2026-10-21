/**
 * Toy game for core tests. One random player is the oracle and knows the
 * secret word; everyone else guesses until someone gets it or time runs out.
 * `makeOracle({ leak })` builds deliberately broken variants for the leak harness.
 */
import { z } from 'zod'
import { defineGame, gameError, type PlayerId } from '../../src/contract.ts'

export interface OracleState {
  phase: 'guessing' | 'done'
  oracleId: PlayerId
  word: string
  guesses: { playerId: PlayerId; word: string }[]
  winnerId: PlayerId | null
}

export type OracleAction =
  | { type: 'guess'; word: string }
  | { type: 'reveal' }
  | { type: 'time_up' }

export interface OracleView {
  phase: OracleState['phase']
  youAreOracle: boolean
  word: string | null
  guesses: OracleState['guesses']
  winnerId: PlayerId | null
  oracleId: PlayerId | null
  spotlight?: PlayerId
}

export const ROUND_MS = 60_000

export function makeOracle(options: { leak?: 'word' | 'oracle' } = {}) {
  const { leak } = options
  return defineGame<OracleState, OracleAction, OracleView, { rounds: number }, { word: string }>({
    id: 'oracle',
    name: 'Oracle',
    description: 'Test game',
    minPlayers: 2,
    maxPlayers: 6,
    settingsSchema: z.object({ rounds: z.number().int().min(1).max(3) }),
    defaultSettings: { rounds: 1 },
    actionSchema: z.discriminatedUnion('type', [
      z.object({ type: z.literal('guess'), word: z.string().trim().min(1).max(24) }),
      z.object({ type: z.literal('reveal') }),
      z.object({ type: z.literal('time_up') }),
    ]),

    init(ctx) {
      const oracle = ctx.rng.pick(ctx.players)
      return {
        state: { phase: 'guessing', oracleId: oracle.id, word: ctx.prepared?.word ?? 'apple', guesses: [], winnerId: null },
        effects: [{ type: 'schedule', key: 'round', at: ctx.now + ROUND_MS, action: { type: 'time_up' } }],
      }
    },

    reduce(state, action, ctx) {
      switch (action.type) {
        case 'guess': {
          if (state.phase !== 'guessing') return gameError('Round is over')
          if (ctx.actorId === null || ctx.actorId === state.oracleId) return gameError('The oracle cannot guess')
          // Guesses that equal the word are not recorded as text (that would leak it).
          if (action.word.toLowerCase() === state.word.toLowerCase()) {
            return {
              state: { ...state, phase: 'done', winnerId: ctx.actorId },
              effects: [{ type: 'cancel', key: 'round' }],
            }
          }
          return { state: { ...state, guesses: [...state.guesses, { playerId: ctx.actorId, word: action.word }] } }
        }
        case 'reveal':
          if (ctx.actorId !== ctx.hostId) return gameError('Host only')
          if (state.phase === 'done') return { state, effects: [{ type: 'gameOver' }] }
          return { state: { ...state, phase: 'done' }, effects: [{ type: 'cancel', key: 'round' }] }
        case 'time_up':
          if (ctx.actorId !== null) return gameError('Not allowed')
          if (state.phase !== 'guessing') return { state }
          return {
            state: { ...state, phase: 'done' },
            effects: [{ type: 'notice', to: 'all', message: 'Time is up' }],
          }
      }
    },

    view(state, viewerId) {
      const isOracle = viewerId === state.oracleId
      const done = state.phase === 'done'
      const view: OracleView = {
        phase: state.phase,
        youAreOracle: isOracle,
        word: isOracle || done ? state.word : null,
        guesses: state.guesses,
        winnerId: state.winnerId,
        oracleId: isOracle || done ? state.oracleId : null,
      }
      if (leak === 'word') view.word = state.word
      if (leak === 'oracle') view.spotlight = state.oracleId
      return view
    },

    onPlayerDisconnected(state, playerId) {
      if (state.phase === 'guessing' && playerId === state.oracleId) {
        return { state, effects: [{ type: 'notice', to: 'host', message: 'The oracle disconnected' }] }
      }
      return { state }
    },

    secrets: [
      {
        name: 'word',
        visibleTo: (state, viewerId) => viewerId === state.oracleId || state.phase === 'done',
        values: (state) => [state.word],
        variants: (state) => [{ ...state, word: 'zz-other-word' }],
      },
      {
        name: 'oracleId',
        visibleTo: (state, viewerId) => viewerId === state.oracleId || state.phase === 'done',
        variants: (state) => ALL_PLAYERS.filter((id) => id !== state.oracleId).map((oracleId) => ({ ...state, oracleId })),
      },
    ],
  })
}

export const ALL_PLAYERS = ['p1', 'p2', 'p3', 'p4']
export const players = ALL_PLAYERS.map((id) => ({ id, name: id.toUpperCase() }))
