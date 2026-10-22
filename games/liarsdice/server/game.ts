/**
 * Liar's Dice: pure init / reduce / view, plus the secrets spec checked by
 * the core leak test. Dice come from ctx.rng; there is no I/O at all.
 *
 * BIDDING -> REVEAL -> (BIDDING | RESULTS) -> new_match -> BIDDING
 */
import {
  defineGame,
  gameError,
  type BaseCtx,
  type Effect,
  type GameError,
  type PlayerId,
  type ReduceCtx,
  type Transition,
} from '@wsfg/core/contract'
import { addPoints, carryScores, DISCONNECT_GRACE_MS, isConnected, nextTurnOrder, withoutPlayer } from '@wsfg/core/kit'
import type { ZodType } from 'zod'
import {
  clientActionSchema,
  countFace,
  defaultSettings,
  FACES,
  GAME_ID,
  isLegalBid,
  MAX_PLAYERS,
  MIN_PLAYERS,
  REVEAL_MS,
  settingsSchema,
  type Bid,
  type ClientAction,
  type LiarsDiceSettings,
  type LiarsDiceView,
  type Phase,
  type RoundResult,
} from '../shared/index.ts'

// ---------------------------------------------------------------- state

export interface LiarsDiceState {
  /** Snapshot at match start; settings only change in the lobby. */
  settings: LiarsDiceSettings
  phase: Phase
  /** Counts every roll across matches, so stale timers can tell they're stale. */
  round: number
  /** Match players in seat order. Late joiners wait for the next match. */
  seats: PlayerId[]
  /** Dice left per seat; 0 = out of this match. */
  diceCount: Record<PlayerId, number>
  /** This round's roll per seat (sorted). Secret to everyone but the owner while BIDDING. */
  dice: Record<PlayerId, number[]>
  turn: PlayerId | null
  /** Bumped on every turn change; a skip timer for an older turn is a no-op. */
  turnSeq: number
  bids: Bid[]
  lastRound: RoundResult | null
  /** Who opens the round after the reveal. */
  nextStarter: PlayerId | null
  winnerId: PlayerId | null
  scores: Record<PlayerId, number>
}

/** Dispatched by scheduled effects only (actorId null). */
export type SystemAction =
  | { type: 'turn_skip'; round: number; turnSeq: number }
  | { type: 'reveal_done'; round: number }

export type LiarsDiceAction = ClientAction | SystemAction

type Ctx = BaseCtx<LiarsDiceSettings>
type Step = Transition<LiarsDiceState, LiarsDiceAction>
type Fx = Effect<LiarsDiceAction>[]

const TIMER_KEYS = ['turn_skip', 'reveal'] as const

// ---------------------------------------------------------------- helpers

const cancel = (key: (typeof TIMER_KEYS)[number]): Effect<LiarsDiceAction> => ({ type: 'cancel', key })

function active(state: LiarsDiceState): PlayerId[] {
  return state.seats.filter((id) => (state.diceCount[id] ?? 0) > 0)
}

function totalDice(state: LiarsDiceState): number {
  return active(state).reduce((sum, id) => sum + state.diceCount[id]!, 0)
}

/** The next seat after `id` that still has dice (wrapping round); null if there is none other than `id`. */
function nextActiveAfter(state: LiarsDiceState, id: PlayerId): PlayerId | null {
  const from = state.seats.indexOf(id)
  const n = state.seats.length
  for (let i = 1; i <= n; i++) {
    const seat = state.seats[(from + i) % n]!
    if (seat !== id && (state.diceCount[seat] ?? 0) > 0) return seat
  }
  return null
}

// ---------------------------------------------------------------- transitions

function startMatch(prev: LiarsDiceState | null, ctx: Ctx): Step {
  const ids = ctx.players.map((p) => p.id)
  // 'rotate': random seats for the first match, then each match moves on one seat.
  const seats = nextTurnOrder(prev?.seats ?? null, ids, ctx.rng, 'rotate')
  const diceCount: Record<PlayerId, number> = {}
  for (const id of seats) diceCount[id] = ctx.settings.startingDice
  const state: LiarsDiceState = {
    settings: ctx.settings,
    phase: 'BIDDING',
    round: prev?.round ?? 0,
    seats,
    diceCount,
    dice: {},
    turn: null,
    turnSeq: prev?.turnSeq ?? 0,
    bids: [],
    lastRound: null,
    nextStarter: null,
    winnerId: null,
    scores: carryScores(prev?.scores, ids),
  }
  return rollRound(state, seats[0]!, ctx, TIMER_KEYS.map(cancel))
}

/** Everyone with dice rolls; `starter` opens the bidding. */
function rollRound(state: LiarsDiceState, starter: PlayerId, ctx: Ctx, effects: Fx = []): Step {
  const dice: Record<PlayerId, number[]> = {}
  for (const id of active(state)) {
    dice[id] = Array.from({ length: state.diceCount[id]! }, () => ctx.rng.int(FACES) + 1).sort((a, b) => a - b)
  }
  const next: LiarsDiceState = { ...state, phase: 'BIDDING', round: state.round + 1, dice, bids: [], nextStarter: null }
  return enterTurn(next, starter, ctx, effects)
}

function enterTurn(state: LiarsDiceState, playerId: PlayerId, ctx: Ctx, effects: Fx = []): Step {
  const next = { ...state, turn: playerId, turnSeq: state.turnSeq + 1 }
  effects.push(cancel('turn_skip'))
  if (!isConnected(ctx, playerId)) effects.push(scheduleTurnSkip(next, ctx))
  return { state: next, effects }
}

function scheduleTurnSkip(state: LiarsDiceState, ctx: Ctx): Effect<LiarsDiceAction> {
  return {
    type: 'schedule',
    key: 'turn_skip',
    at: ctx.now + DISCONNECT_GRACE_MS,
    action: { type: 'turn_skip', round: state.round, turnSeq: state.turnSeq },
  }
}

/** Reveal everyone's dice and settle the challenge on the current bid. */
function challenge(state: LiarsDiceState, callerId: PlayerId, call: RoundResult['call'], ctx: Ctx): Step {
  const bid = state.bids.at(-1)!
  const { wildOnes, startingDice } = state.settings
  const count = countFace(Object.values(state.dice).flat(), bid.face, wildOnes)

  let loserId: PlayerId | null = null
  let gainerId: PlayerId | null = null
  if (call === 'liar') loserId = count >= bid.quantity ? callerId : bid.playerId
  else if (count === bid.quantity) gainerId = callerId
  else loserId = callerId

  const diceCount = { ...state.diceCount }
  if (loserId) diceCount[loserId] = diceCount[loserId]! - 1
  if (gainerId) diceCount[gainerId] = Math.min(diceCount[gainerId]! + 1, startingDice)

  const lastRound: RoundResult = { dice: state.dice, bid, callerId, call, count, loserId, gainerId }
  return {
    state: { ...state, phase: 'REVEAL', turn: null, diceCount, lastRound, nextStarter: loserId ?? gainerId },
    effects: [
      cancel('turn_skip'),
      { type: 'schedule', key: 'reveal', at: ctx.now + REVEAL_MS, action: { type: 'reveal_done', round: state.round } },
    ],
  }
}

function revealDone(state: LiarsDiceState, ctx: Ctx): Step {
  const left = active(state)
  if (left.length <= 1) return finishMatch(state, left[0] ?? null)
  const starter = state.nextStarter
  const opener = starter && (state.diceCount[starter] ?? 0) > 0 ? starter : nextActiveAfter(state, starter ?? left[0]!)
  return rollRound(state, opener ?? left[0]!, ctx)
}

/** `winnerId` null: the match ended without a winner (players left). */
function finishMatch(state: LiarsDiceState, winnerId: PlayerId | null, effects: Fx = []): Step {
  const scores = winnerId ? addPoints(state.scores, { [winnerId]: 1 }) : state.scores
  return {
    state: { ...state, phase: 'RESULTS', turn: null, winnerId, scores },
    effects: [...effects, ...TIMER_KEYS.map(cancel)],
  }
}

// ---------------------------------------------------------------- reducer

function reduce(state: LiarsDiceState, action: LiarsDiceAction, ctx: ReduceCtx<LiarsDiceSettings>): Step | GameError {
  const actor = ctx.actorId

  switch (action.type) {
    case 'bid': {
      if (state.phase !== 'BIDDING') return gameError('It is not time to bid')
      if (actor === null || actor !== state.turn) return gameError("It's not your turn")
      const total = totalDice(state)
      if (action.quantity > total) return gameError(`There are only ${total} dice in play`)
      const prev = state.bids.at(-1) ?? null
      if (!isLegalBid(prev, action, state.settings.wildOnes)) {
        return gameError(prev ? 'Your bid must be higher than the last one' : "The opening bid can't be on ones")
      }
      const bid: Bid = { playerId: actor, quantity: action.quantity, face: action.face }
      return enterTurn({ ...state, bids: [...state.bids, bid] }, nextActiveAfter(state, actor) ?? actor, ctx)
    }

    case 'call':
    case 'spot_on': {
      if (state.phase !== 'BIDDING') return gameError('It is not time to call')
      if (actor === null || actor !== state.turn) return gameError("It's not your turn")
      if (action.type === 'spot_on' && !state.settings.spotOn) return gameError('Spot on is off in this game')
      const bid = state.bids.at(-1)
      if (!bid) return gameError('There is no bid to call yet')
      if (bid.playerId === actor) return gameError("You can't call your own bid")
      return challenge(state, actor, action.type === 'call' ? 'liar' : 'spot_on', ctx)
    }

    case 'new_match':
      if (actor === null || actor !== ctx.hostId) return gameError('Only the host can start a new match')
      if (state.phase !== 'RESULTS') return gameError('The match is not over yet')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startMatch(state, ctx)

    // ---- scheduled (actorId null only); stale timers are no-ops
    case 'turn_skip':
      if (actor !== null) return gameError('Not allowed')
      if (state.phase !== 'BIDDING' || action.round !== state.round || action.turnSeq !== state.turnSeq) return { state }
      if (state.turn === null || isConnected(ctx, state.turn)) return { state }
      return enterTurn(state, nextActiveAfter(state, state.turn) ?? state.turn, ctx)

    case 'reveal_done':
      if (actor !== null) return gameError('Not allowed')
      if (state.phase !== 'REVEAL' || action.round !== state.round) return { state }
      return revealDone(state, ctx)
  }
}

// ---------------------------------------------------------------- view

function view(state: LiarsDiceState, viewerId: PlayerId): LiarsDiceView {
  const seated = state.seats.includes(viewerId)
  const playing = seated && (state.diceCount[viewerId] ?? 0) > 0
  return {
    phase: state.phase,
    round: state.round,
    you: {
      status: !seated ? 'waiting' : playing ? 'playing' : 'out',
      dice: playing ? (state.dice[viewerId] ?? []) : [],
    },
    seats: state.seats.map((id) => ({ id, dice: state.diceCount[id] ?? 0 })),
    totalDice: totalDice(state),
    turn: state.phase === 'BIDDING' ? state.turn : null,
    bid: state.phase === 'BIDDING' ? (state.bids.at(-1) ?? null) : null,
    bids: state.bids,
    lastRound: state.lastRound,
    winnerId: state.phase === 'RESULTS' ? state.winnerId : null,
    scores: state.scores,
  }
}

// ---------------------------------------------------------------- module

export const liarsDice = defineGame<LiarsDiceState, LiarsDiceAction, LiarsDiceView, LiarsDiceSettings>({
  id: GAME_ID,
  name: "Liar's Dice",
  description: 'Roll in secret, bid on what everyone holds, and call out the liars.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  settingsSchema,
  defaultSettings,
  // Clients can only send ClientActions; SystemActions come from scheduled effects.
  actionSchema: clientActionSchema as ZodType<LiarsDiceAction>,

  init: (ctx) => startMatch(null, ctx),
  reduce,
  view,

  onPlayerDisconnected(state, playerId, ctx) {
    if (state.phase === 'BIDDING' && state.turn === playerId) return { state, effects: [scheduleTurnSkip(state, ctx)] }
    return { state }
  },

  onPlayerReconnected(state, playerId) {
    if (state.phase === 'BIDDING' && state.turn === playerId) return { state, effects: [cancel('turn_skip')] }
    return { state }
  },

  onPlayerRemoved(state, playerId, ctx) {
    const scores = withoutPlayer(state.scores, playerId)
    if (!state.seats.includes(playerId)) return { state: { ...state, scores } }

    const hadDice = (state.diceCount[playerId] ?? 0) > 0
    // Worked out before the seat goes, while there is still a position to count from.
    const after = nextActiveAfter(state, playerId)
    const next: LiarsDiceState = {
      ...state,
      scores,
      seats: state.seats.filter((id) => id !== playerId),
      diceCount: withoutPlayer(state.diceCount, playerId),
      dice: withoutPlayer(state.dice, playerId),
      nextStarter: state.nextStarter === playerId ? after : state.nextStarter,
    }
    if (state.phase !== 'BIDDING' || !hadDice) return { state: next }

    const left = active(next)
    if (left.length <= 1) {
      return finishMatch(next, null, [{ type: 'notice', to: 'all', message: 'Not enough players left to finish the match.' }])
    }
    // The bids were made against dice that are gone: everyone re-rolls and nobody loses a die.
    const starter = state.turn === playerId || state.turn === null ? (after ?? left[0]!) : state.turn
    return rollRound(next, starter, ctx, [{ type: 'notice', to: 'all', message: 'A player left, so everyone re-rolls.' }])
  },

  secrets: [
    {
      name: 'dice',
      visibleTo: (s) => s.phase !== 'BIDDING',
      // Each other player's roll changed in turn; the viewer's own dice stay put.
      variants: (s, viewerId) =>
        Object.keys(s.dice)
          .filter((id) => id !== viewerId && s.dice[id]!.length > 0)
          .map((id) => ({ ...s, dice: { ...s.dice, [id]: s.dice[id]!.map((d) => (d % FACES) + 1) } })),
    },
  ],
})
