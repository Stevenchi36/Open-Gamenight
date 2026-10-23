/**
 * Tic-Tac-Toe types shared by the server module and the Vue client:
 * settings (none), client actions and the per-player view.
 */
import type { GameMeta } from '@wsfg/core/contract'
import { z } from 'zod'

type PlayerId = string

export const GAME_ID = 'tictactoe'
export const PLAYERS = 2

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: 'Tic-Tac-Toe',
  description: 'Two players, X and O: get three in a row first.',
  minPlayers: PLAYERS,
  maxPlayers: PLAYERS,
}

export const CELLS = 9

// ---------------------------------------------------------------- settings

export const settingsSchema = z.object({})

export type TicTacToeSettings = z.infer<typeof settingsSchema>

export const defaultSettings: TicTacToeSettings = {}

// ---------------------------------------------------------------- actions

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('place'), cell: z.number().int().min(0).max(CELLS - 1) }),
  z.object({ type: z.literal('new_game') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'PLAYING' | 'RESULTS'
export type Mark = 'X' | 'O'
export type Cell = Mark | null
/** 'abandoned': a player left mid-game. */
export type Outcome = 'win' | 'draw' | 'abandoned'

export interface TicTacToeView {
  phase: Phase
  /** Counts games played in this room. */
  game: number
  you: {
    /** null: not in this game (joined after it started). */
    mark: Mark | null
  }
  marks: Record<Mark, PlayerId>
  /** Row by row. */
  board: Cell[]
  /** PLAYING only. */
  turn: PlayerId | null
  /** RESULTS only. */
  outcome: Outcome | null
  winnerId: PlayerId | null
  /** The winning three cells. */
  line: number[] | null
  scores: Record<PlayerId, number>
}
