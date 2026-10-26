/**
 * Dots and Boxes types shared by the server module and the Vue client: settings,
 * client actions, seat colours and the per-player view.
 */
import type { GameMeta } from '@wsfg/core/contract'
import { z } from 'zod'

type PlayerId = string

export const GAME_ID = 'dotsandboxes'
export const MIN_PLAYERS = 2

/** Seat colours in turn order, so red always goes first. */
export const COLORS = ['red', 'blue', 'green', 'orange'] as const
export type Color = (typeof COLORS)[number]

/** Spread into both the server and the client module. */
export const meta: GameMeta = {
  id: GAME_ID,
  name: 'Dots and Boxes',
  description: 'Take turns joining dots: close a box to claim it and go again.',
  styles: ['board'],
  minPlayers: MIN_PLAYERS,
  maxPlayers: COLORS.length,
}

// ---------------------------------------------------------------- settings

/** Boxes per side of the square grid. */
export const GRIDS = [3, 4, 5, 6, 7] as const
export type Grid = (typeof GRIDS)[number]
export const MAX_GRID = 7

export const settingsSchema = z.object({
  grid: z.literal(GRIDS),
})

export type DotsSettings = z.infer<typeof settingsSchema>

export const defaultSettings: DotsSettings = {
  grid: 5,
}

// ---------------------------------------------------------------- actions

/** Across ('h') or down ('v'). */
export type Dir = 'h' | 'v'

/** A line by the dot it starts from, counted from the top left: 'h' runs right from it, 'v' down. */
export interface Line {
  dir: Dir
  row: number
  col: number
}

/** Actions a client may send inside the `action` envelope. */
export const clientActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('draw'),
    dir: z.enum(['h', 'v']),
    row: z.number().int().min(0).max(MAX_GRID),
    col: z.number().int().min(0).max(MAX_GRID),
  }),
  z.object({ type: z.literal('new_game') }),
])

export type ClientAction = z.infer<typeof clientActionSchema>

// ---------------------------------------------------------------- view

export type Phase = 'PLAYING' | 'RESULTS'
/** 'abandoned': too few players were left to finish. */
export type Outcome = 'win' | 'abandoned'

export interface Seat {
  id: PlayerId
  /** Boxes claimed this game. */
  boxes: number
  /** Left mid-game: skipped, can't win, boxes stay. */
  left: boolean
}

export interface DotsView {
  phase: Phase
  /** Counts games played in this room. */
  game: number
  grid: number
  you: {
    /** Index into `seats` and COLORS. null: not in this game. */
    seat: number | null
  }
  /** Turn order. */
  seats: Seat[]
  /** (grid+1) rows × grid: drawn across-lines. */
  h: boolean[][]
  /** grid rows × (grid+1): drawn down-lines. */
  v: boolean[][]
  /** grid × grid: the owner's seat index. */
  boxes: (number | null)[][]
  /** The latest line drawn. */
  last: Line | null
  /** PLAYING only. */
  turn: PlayerId | null
  /** RESULTS only. */
  outcome: Outcome | null
  /** RESULTS only; more than one is a shared win. */
  winnerIds: PlayerId[]
  scores: Record<PlayerId, number>
}
