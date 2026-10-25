/**
 * Drop Line types shared by the server module and the Vue client: settings and
 * the board sizes they pick, client actions and the per-player view.
 */
import type { GameMeta } from '@wsfg/core/contract'
import { z } from 'zod'

type PlayerId = string

export const GAME_ID = 'dropline'
export const PLAYERS = 2

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: 'Drop Line',
  description: 'Two players drop discs in turn: first to line them up wins.',
  styles: ['board'],
  minPlayers: PLAYERS,
  maxPlayers: PLAYERS,
}

// ---------------------------------------------------------------- settings

export const LINE_LENGTHS = [3, 4, 5, 6] as const
export const BOARD_SIZES = ['small', 'standard', 'large'] as const

export type LineLength = (typeof LINE_LENGTHS)[number]
export type BoardSize = (typeof BOARD_SIZES)[number]

/** Columns × rows for each line length, so every board leaves room to build and block. */
export const BOARD_DIMENSIONS: Record<LineLength, Record<BoardSize, { cols: number; rows: number }>> = {
  3: { small: { cols: 4, rows: 4 }, standard: { cols: 5, rows: 4 }, large: { cols: 6, rows: 5 } },
  4: { small: { cols: 6, rows: 5 }, standard: { cols: 7, rows: 6 }, large: { cols: 8, rows: 7 } },
  5: { small: { cols: 8, rows: 7 }, standard: { cols: 9, rows: 7 }, large: { cols: 10, rows: 8 } },
  6: { small: { cols: 9, rows: 8 }, standard: { cols: 10, rows: 9 }, large: { cols: 11, rows: 10 } },
}

export const settingsSchema = z.object({
  lineLength: z.literal(LINE_LENGTHS),
  boardSize: z.enum(BOARD_SIZES),
})

export type DropLineSettings = z.infer<typeof settingsSchema>

export const defaultSettings: DropLineSettings = {
  lineLength: 4,
  boardSize: 'standard',
}

/** The largest board has 11 columns. */
export const MAX_COLS = 11

// ---------------------------------------------------------------- actions

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('drop'), column: z.number().int().min(0).max(MAX_COLS - 1) }),
  z.object({ type: z.literal('new_game') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'PLAYING' | 'RESULTS'
export type Disc = 'red' | 'blue'
/** 'abandoned': a player left mid-game. */
export type Outcome = 'win' | 'draw' | 'abandoned'

/** Row 0 is the bottom. */
export interface Spot {
  col: number
  row: number
}

export interface DropLineView {
  phase: Phase
  /** Counts games played in this room. */
  game: number
  cols: number
  rows: number
  lineLength: number
  you: {
    /** null: not in this game (joined after it started). */
    disc: Disc | null
  }
  discs: Record<Disc, PlayerId>
  /** Per column, bottom first. */
  columns: Disc[][]
  /** The latest disc dropped. */
  last: Spot | null
  /** PLAYING only. */
  turn: PlayerId | null
  /** RESULTS only. */
  outcome: Outcome | null
  winnerId: PlayerId | null
  /** The winning line, every disc in it. */
  line: Spot[] | null
  scores: Record<PlayerId, number>
}
