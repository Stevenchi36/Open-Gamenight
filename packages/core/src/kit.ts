/**
 * Pure building blocks for game reducers: player presence, turn order, scores, votes, cards.
 * Everything takes what it needs from ctx explicitly and returns new values,
 * so it is safe inside init / reduce / view / lifecycle hooks.
 */
import { z } from 'zod'
import type { BaseCtx, PlayerId, SecretDef } from './contract.ts'
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

/**
 * Highest value first, with places as in sport: equal values share a place and the next
 * place skips ("1st, 1st, 3rd"). Ties keep their input order.
 */
export function placings<T>(items: readonly T[], value: (item: T) => number): { item: T; place: number }[] {
  const sorted = [...items].sort((a, b) => value(b) - value(a))
  return sorted.map((item) => ({ item, place: sorted.findIndex((other) => value(other) === value(item)) + 1 }))
}

/** A copy of a per-player record without one player. */
export function withoutPlayer<T>(record: Record<PlayerId, T>, id: PlayerId): Record<PlayerId, T> {
  const next = { ...record }
  delete next[id]
  return next
}

// ---------------------------------------------------------------- votes

/** Voter -> target. */
export type Ballots = Record<PlayerId, PlayerId>

export interface Tally {
  /** Votes received per target. */
  votes: Record<PlayerId, number>
  /** The ballots that counted. */
  ballots: Ballots
  /** The single most-voted target; null on a tie or with no votes. */
  leaderId: PlayerId | null
}

/** Counts the ballots whose voter and target are both in `eligible` (e.g. this round's players). */
export function tallyVotes(ballots: Ballots, eligible: readonly PlayerId[]): Tally {
  const votes: Record<PlayerId, number> = {}
  const counted: Ballots = {}
  for (const [voter, target] of Object.entries(ballots)) {
    if (!eligible.includes(voter) || !eligible.includes(target)) continue
    votes[target] = (votes[target] ?? 0) + 1
    counted[voter] = target
  }
  const top = Math.max(0, ...Object.values(votes))
  const leaders = Object.keys(votes).filter((id) => votes[id] === top)
  return { votes, ballots: counted, leaderId: top > 0 && leaders.length === 1 ? leaders[0]! : null }
}

/** Ballots without any cast by or for `id` (a player who left). */
export function dropBallots(ballots: Ballots, id: PlayerId): Ballots {
  const next: Ballots = {}
  for (const [voter, target] of Object.entries(ballots)) if (voter !== id && target !== id) next[voter] = target
  return next
}

/**
 * Leak-test spec for secret ballots: while hidden, a viewer's view must not change when someone
 * else moves their vote. The viewer's own ballot stays fixed, since they may see it.
 */
export function secretBallots<S>(spec: {
  name?: string
  visibleTo(state: S, viewerId: PlayerId): boolean
  ballots(state: S): Ballots
  /** Who can be voted for; used to pick another target. */
  candidates(state: S): readonly PlayerId[]
  withBallots(state: S, ballots: Ballots): S
}): SecretDef<S> {
  return {
    name: spec.name ?? 'ballots',
    visibleTo: spec.visibleTo,
    variants(state, viewerId) {
      const ballots = spec.ballots(state)
      return Object.keys(ballots)
        .filter((voter) => voter !== viewerId)
        .flatMap((voter) => {
          const alt = spec.candidates(state).find((id) => id !== voter && id !== ballots[voter])
          return alt ? [spec.withBallots(state, { ...ballots, [voter]: alt })] : []
        })
    },
  }
}

// ---------------------------------------------------------------- move history

/**
 * How much of a game's move log players see, for games where remembering past moves is the
 * skill: 'off' only the latest move (the table just saw it), 'last5' the last five, 'all' every move.
 */
export const moveHistorySchema = z.enum(['off', 'last5', 'all'])
export type MoveHistory = z.infer<typeof moveHistorySchema>

/** The moves a view may carry (oldest first), and how many came before them so clients can still number them. */
export function visibleMoves<M>(log: readonly M[], history: MoveHistory): { log: M[]; logStart: number } {
  const keep = history === 'all' ? log.length : history === 'last5' ? 5 : 1
  const logStart = Math.max(0, log.length - keep)
  return { log: log.slice(logStart), logStart }
}

/** Leak-test spec for `visibleMoves`: changing moves older than the window must not change any view. */
export function hiddenMoves<S, M>(spec: {
  log(state: S): readonly M[]
  history(state: S): MoveHistory
  withLog(state: S, log: M[]): S
}): SecretDef<S> {
  return {
    name: 'move history',
    visibleTo: () => false,
    variants(state) {
      const log = spec.log(state)
      const { logStart } = visibleMoves(log, spec.history(state))
      if (logStart === 0) return []
      // The oldest hidden move swapped for the latest one: same length, different history.
      return [spec.withLog(state, [log.at(-1)!, ...log.slice(1)])]
    },
  }
}

// ---------------------------------------------------------------- cards

/** Low to high, ace low. */
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const
export const SUITS = ['S', 'H', 'D', 'C'] as const
export const rankSchema = z.enum(RANKS)
export type Rank = (typeof RANKS)[number]
export type Suit = (typeof SUITS)[number]

export interface Card {
  rank: Rank
  suit: Suit
}

const RANK_NAMES: Record<Rank, [string, string]> = {
  A: ['ace', 'aces'],
  '2': ['two', 'twos'],
  '3': ['three', 'threes'],
  '4': ['four', 'fours'],
  '5': ['five', 'fives'],
  '6': ['six', 'sixes'],
  '7': ['seven', 'sevens'],
  '8': ['eight', 'eights'],
  '9': ['nine', 'nines'],
  '10': ['ten', 'tens'],
  J: ['jack', 'jacks'],
  Q: ['queen', 'queens'],
  K: ['king', 'kings'],
}

/** "sevens"; "seven" with `count` 1. */
export function rankName(rank: Rank, count = 2): string {
  return RANK_NAMES[rank][count === 1 ? 0 : 1]
}

/** The 52 cards in a fixed order; shuffle with `ctx.rng.shuffle`. */
export function standardDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })))
}

/** A copy sorted by rank, then suit, as a hand is shown. */
export function sortCards(cards: readonly Card[]): Card[] {
  const order = (c: Card) => RANKS.indexOf(c.rank) * SUITS.length + SUITS.indexOf(c.suit)
  return [...cards].sort((a, b) => order(a) - order(b))
}

/** Deals `count` cards to each player one at a time from the top (index 0), like a real deal. */
export function deal<C>(deck: readonly C[], players: readonly PlayerId[], count: number): { hands: Record<PlayerId, C[]>; rest: C[] } {
  if (players.length * count > deck.length) throw new RangeError(`deal: ${players.length} × ${count} cards from a deck of ${deck.length}`)
  const hands: Record<PlayerId, C[]> = {}
  for (const id of players) hands[id] = []
  for (let i = 0; i < players.length * count; i++) hands[players[i % players.length]!]!.push(deck[i]!)
  return { hands, rest: deck.slice(players.length * count) }
}
