/**
 * Pure building blocks for game reducers: player presence, turn order, scores.
 * Everything takes what it needs from ctx explicitly and returns new values,
 * so it is safe inside init / reduce / view / lifecycle hooks.
 */
import { z } from 'zod'
import type { BaseCtx, PlayerId } from './contract.ts'
import type { Rng } from './rng.ts'

type PlayersCtx = Pick<BaseCtx<unknown>, 'players'>

/** Grace before a disconnected player's turn (or other move the game waits on) is skipped. */
export const DISCONNECT_GRACE_MS = 15_000

// ---------------------------------------------------------------- players

/** In the room (connected or not); removed players are gone from ctx.players. */
export function isPresent(ctx: PlayersCtx, id: PlayerId): boolean {
  return ctx.players.some((p) => p.id === id)
}

export function isConnected(ctx: PlayersCtx, id: PlayerId): boolean {
  return ctx.players.find((p) => p.id === id)?.connected ?? false
}

/** A connected player from `candidates`: the host if eligible, else the first in join order. null if none is connected. */
export function pickConnected(ctx: Pick<BaseCtx<unknown>, 'players' | 'hostId'>, candidates: readonly PlayerId[]): PlayerId | null {
  const eligible = ctx.players.filter((p) => p.connected && candidates.includes(p.id))
  return (eligible.find((p) => p.id === ctx.hostId) ?? eligible[0])?.id ?? null
}

// ---------------------------------------------------------------- turn order

/** Who goes first each round. 'rotate': random first round, then the next player in line starts. 'random': reshuffled every round. */
export const playerOrderSchema = z.enum(['rotate', 'random'])
export type PlayerOrder = z.infer<typeof playerOrderSchema>

/**
 * The turn order for a new round. 'rotate': last round's order moved on one seat, so the next
 * player in line starts; players who left drop out and newcomers join the end. 'random', the
 * first round (`prev` null), or a one-off `shuffle`: a fresh shuffle.
 */
export function nextTurnOrder(
  prev: readonly PlayerId[] | null,
  ids: readonly PlayerId[],
  rng: Rng,
  mode: PlayerOrder,
  shuffle = false,
): PlayerId[] {
  if (!prev || shuffle || mode === 'random') return rng.shuffle(ids)
  const kept = [...prev.slice(1), ...prev.slice(0, 1)].filter((id) => ids.includes(id))
  return [...kept, ...ids.filter((id) => !kept.includes(id))]
}

// ---------------------------------------------------------------- scores

export type Scores = Record<PlayerId, number>

/** Scores for a new round: everyone in `ids`, keeping what they had (0 for newcomers). Players not in `ids` drop out. */
export function carryScores(prev: Scores | undefined, ids: readonly PlayerId[]): Scores {
  const scores: Scores = {}
  for (const id of ids) scores[id] = prev?.[id] ?? 0
  return scores
}

export function addPoints(scores: Scores, points: Scores): Scores {
  const next = { ...scores }
  for (const [id, n] of Object.entries(points)) next[id] = (next[id] ?? 0) + n
  return next
}

/** A copy of a per-player record without one player. */
export function withoutPlayer<T>(record: Record<PlayerId, T>, id: PlayerId): Record<PlayerId, T> {
  const next = { ...record }
  delete next[id]
  return next
}
