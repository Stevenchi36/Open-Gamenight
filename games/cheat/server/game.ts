/**
 * Cheat: pure init / reduce / onTimer / view, plus the secrets spec checked by
 * the core leak test. The deck is shuffled with ctx.rng; there is no I/O at all.
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
import {
  addPoints,
  carryScores,
  deal,
  DISCONNECT_GRACE_MS,
  isConnected,
  nextTurnOrder,
  sortCards,
  standardDeck,
  withoutPlayer,
  type Card,
  type Rank,
} from '@wsfg/core/kit'
import {
  allowedClaims,
  clientActionSchema,
  defaultSettings,
  meta,
  MIN_PLAYERS,
  settingsSchema,
  type CheatSettings,
  type CheatView,
  type ClientAction,
  type Move,
  type Phase,
  type Stage,
} from '../shared/index.ts'

// ---------------------------------------------------------------- state

/** One play on the pile: the real cards and what was claimed. */
export interface PilePlay {
  playerId: PlayerId
  cards: Card[]
  claim: Rank
}

export interface CheatState {
  /** Snapshot at game start; settings only change in the lobby. */
  settings: CheatSettings
  phase: Phase
  /** Counts games, so stale timers can tell they're stale. */
  game: number
  /** This game's players in seat order, leavers included. Late joiners wait for the next game. */
  seats: PlayerId[]
  /** Seats whose player left this game. */
  left: PlayerId[]
  /** Secret to everyone but the owner. */
  hands: Record<PlayerId, Card[]>
  /** Oldest first. Secret to everyone; only a call turns up the latest play. */
  pile: PilePlay[]
  /** Plays made this game; the latest is number `plays`. */
  plays: number
  /** The latest play can still be called. */
  open: boolean
  lastClaim: Rank | null
  turn: PlayerId | null
  /** Bumped on every turn change; a skip timer for an older turn is a no-op. */
  turnSeq: number
  stage: Stage
  callUntil: number | null
  log: Move[]
  outcome: 'win' | 'abandoned' | null
  winnerId: PlayerId | null
  scores: Record<PlayerId, number>
}

/** Scheduled by the game itself and handled by onTimer; clients can't send these. */
export type CheatTimer =
  | { type: 'call_window'; game: number; play: number }
  | { type: 'turn_skip'; game: number; turnSeq: number }

type Ctx = BaseCtx<CheatSettings>
type Step = Transition<CheatState, CheatTimer>
type Fx = Effect<CheatTimer>[]

const cancelSkip: Effect<CheatTimer> = { type: 'cancel', key: 'turn_skip' }
const cancelWindow: Effect<CheatTimer> = { type: 'cancel', key: 'call_window' }

// ---------------------------------------------------------------- helpers

function playing(state: CheatState): PlayerId[] {
  return state.seats.filter((id) => !state.left.includes(id))
}

const handOf = (state: CheatState, id: PlayerId): Card[] => state.hands[id] ?? []

const sameCard = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit

/** The next seat after `id` still in the game (wrapping round); `id` itself if nobody else is. */
function nextSeat(state: CheatState, id: PlayerId): PlayerId {
  const from = state.seats.indexOf(id)
  const n = state.seats.length
  for (let i = 1; i < n; i++) {
    const seat = state.seats[(from + i) % n]!
    if (!state.left.includes(seat)) return seat
  }
  return id
}

/** Deals the whole deck; when it doesn't divide, the first seats get one more. */
function dealAll(deck: Card[], seats: PlayerId[]): Record<PlayerId, Card[]> {
  const { hands, rest } = deal(deck, seats, Math.floor(deck.length / seats.length))
  rest.forEach((card, i) => hands[seats[i]!]!.push(card))
  return hands
}

// ---------------------------------------------------------------- transitions

function startGame(prev: CheatState | null, ctx: Ctx): Step {
  const ids = ctx.players.map((p) => p.id)
  // 'rotate' keeps everyone's place round the table and moves the first turn on one seat.
  const seats = nextTurnOrder(prev?.seats ?? null, ids, ctx.rng, 'rotate')
  const state: CheatState = {
    settings: ctx.settings,
    phase: 'PLAYING',
    game: (prev?.game ?? 0) + 1,
    seats,
    left: [],
    hands: dealAll(ctx.rng.shuffle(standardDeck()), seats),
    pile: [],
    plays: 0,
    open: false,
    lastClaim: null,
    turn: null,
    turnSeq: prev?.turnSeq ?? 0,
    stage: 'play',
    callUntil: null,
    log: [],
    outcome: null,
    winnerId: null,
    scores: carryScores(prev?.scores, ids),
  }
  return enterTurn(state, seats[0]!, ctx, [cancelWindow])
}

function enterTurn(state: CheatState, playerId: PlayerId, ctx: Ctx, effects: Fx = []): Step {
  const next = { ...state, turn: playerId, turnSeq: state.turnSeq + 1 }
  effects.push(cancelSkip)
  if (!isConnected(ctx, playerId)) effects.push(scheduleTurnSkip(next, ctx))
  return { state: next, effects }
}

function scheduleTurnSkip(state: CheatState, ctx: Ctx): Effect<CheatTimer> {
  return {
    type: 'schedule',
    key: 'turn_skip',
    at: ctx.now + DISCONNECT_GRACE_MS,
    action: { type: 'turn_skip', game: state.game, turnSeq: state.turnSeq },
  }
}

function finishGame(state: CheatState, winnerId: PlayerId, effects: Fx = []): Step {
  return {
    state: {
      ...state,
      phase: 'RESULTS',
      turn: null,
      stage: 'play',
      callUntil: null,
      open: false,
      outcome: 'win',
      winnerId,
      scores: addPoints(state.scores, { [winnerId]: 1 }),
    },
    effects: [...effects, cancelSkip, cancelWindow],
  }
}

function abandonGame(state: CheatState, effects: Fx): Step {
  return {
    state: { ...state, phase: 'RESULTS', turn: null, stage: 'play', callUntil: null, open: false, outcome: 'abandoned', winnerId: null },
    effects: [...effects, cancelSkip, cancelWindow],
  }
}

function play(state: CheatState, playerId: PlayerId, cards: Card[], claim: Rank, ctx: Ctx): Step {
  const plays = state.plays + 1
  const callUntil = ctx.now + state.settings.callSeconds * 1000
  const next: CheatState = {
    ...state,
    hands: { ...state.hands, [playerId]: handOf(state, playerId).filter((c) => !cards.some((p) => sameCard(c, p))) },
    pile: [...state.pile, { playerId, cards, claim }],
    plays,
    open: true,
    lastClaim: claim,
    stage: 'calling',
    callUntil,
    log: [...state.log, { kind: 'play', playerId, count: cards.length, claim }],
  }
  // The turn moves on now, so the next player can pick their cards during the call time.
  return enterTurn(next, nextSeat(next, playerId), ctx, [
    { type: 'schedule', key: 'call_window', at: callUntil, action: { type: 'call_window', game: state.game, play: plays } },
  ])
}

function call(state: CheatState, callerId: PlayerId): Step {
  const top = state.pile.at(-1)!
  const lied = top.cards.some((c) => c.rank !== top.claim)
  const pickerId = lied ? top.playerId : callerId
  const picked = state.pile.flatMap((p) => p.cards)
  const move: Move = {
    kind: 'call',
    callerId,
    playerId: top.playerId,
    count: top.cards.length,
    claim: top.claim,
    cards: top.cards,
    lied,
    pickerId,
    picked: picked.length,
  }
  const next: CheatState = {
    ...state,
    hands: { ...state.hands, [pickerId]: [...handOf(state, pickerId), ...picked] },
    pile: [],
    open: false,
    stage: 'play',
    callUntil: null,
    log: [...state.log, move],
  }
  // A true last play survives the call: that player is out, so they win now.
  if (!lied && handOf(next, top.playerId).length === 0) return finishGame(next, top.playerId)
  // Play goes on with whoever's turn it already was.
  return { state: next, effects: [cancelWindow] }
}

// ---------------------------------------------------------------- reducer

function reduce(state: CheatState, action: ClientAction, ctx: ReduceCtx<CheatSettings>): Step | GameError {
  const actor = ctx.actorId

  switch (action.type) {
    case 'play': {
      if (state.phase !== 'PLAYING') return gameError('The game is over')
      if (actor !== state.turn) return gameError("It's not your turn")
      if (state.stage !== 'play') return gameError('Wait for the call time to end')
      const { cards, claim } = action
      if (cards.some((c, i) => cards.findIndex((d) => sameCard(c, d)) !== i)) return gameError('Each card can only be played once')
      if (!cards.every((c) => handOf(state, actor).some((h) => sameCard(c, h)))) return gameError('You can only play cards from your hand')
      if (!allowedClaims(state.settings.claims, state.lastClaim).includes(claim)) return gameError("You can't claim that rank now")
      return play(state, actor, cards.map((c) => ({ rank: c.rank, suit: c.suit })), claim, ctx)
    }

    case 'call': {
      if (state.phase !== 'PLAYING') return gameError('The game is over')
      if (!playing(state).includes(actor)) return gameError("You're not in this game")
      if (!state.open || action.play !== state.plays) return gameError('That play can no longer be called')
      if (state.pile.at(-1)!.playerId === actor) return gameError("You can't call your own play")
      return call(state, actor)
    }

    case 'new_game':
      if (actor !== ctx.hostId) return gameError('Only the host can start a new game')
      if (state.phase !== 'RESULTS') return gameError('The game is not over yet')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startGame(state, ctx)
  }
}

/** Stale timers are no-ops. */
function onTimer(state: CheatState, action: CheatTimer, ctx: TimerCtx<CheatSettings>): Step {
  if (state.phase !== 'PLAYING' || action.game !== state.game) return { state }

  switch (action.type) {
    case 'call_window': {
      if (state.stage !== 'calling' || action.play !== state.plays) return { state }
      const top = state.pile.at(-1)
      // Out of cards and nobody called: that player wins.
      if (state.open && top && handOf(state, top.playerId).length === 0) return finishGame(state, top.playerId)
      return { state: { ...state, stage: 'play', callUntil: null } }
    }

    case 'turn_skip': {
      if (action.turnSeq !== state.turnSeq || state.turn === null || isConnected(ctx, state.turn)) return { state }
      const skipped: CheatState = { ...state, log: [...state.log, { kind: 'skip', playerId: state.turn }] }
      return enterTurn(skipped, nextSeat(state, state.turn), ctx)
    }
  }
}

// ---------------------------------------------------------------- view

function view(state: CheatState, viewerId: PlayerId): CheatView {
  const seated = playing(state).includes(viewerId)
  const inPlay = state.phase === 'PLAYING'
  const top = state.pile.at(-1)
  return {
    phase: state.phase,
    game: state.game,
    settings: state.settings,
    you: { status: seated ? 'playing' : 'waiting', hand: seated ? sortCards(handOf(state, viewerId)) : [] },
    seats: state.seats.map((id) => ({ id, cards: handOf(state, id).length, left: state.left.includes(id) })),
    pile: state.pile.reduce((sum, p) => sum + p.cards.length, 0),
    top: inPlay && state.open && top ? { play: state.plays, playerId: top.playerId, count: top.cards.length, claim: top.claim } : null,
    claims: allowedClaims(state.settings.claims, state.lastClaim),
    turn: inPlay ? state.turn : null,
    stage: state.stage,
    callUntil: inPlay && state.stage === 'calling' ? state.callUntil : null,
    log: state.log,
    outcome: inPlay ? null : state.outcome,
    winnerId: inPlay ? null : state.winnerId,
    scores: state.scores,
  }
}

// ---------------------------------------------------------------- secrets

/** Swaps the first card of two other players' hands. */
function swapHands(state: CheatState, a: PlayerId, b: PlayerId): CheatState {
  const [x, ...restA] = handOf(state, a)
  const [y, ...restB] = handOf(state, b)
  return { ...state, hands: { ...state.hands, [a]: [y!, ...restA], [b]: [x!, ...restB] } }
}

/** Swaps the first card of the latest play with the first card of a hand. */
function swapTopWithHand(state: CheatState, id: PlayerId): CheatState {
  const top = state.pile.at(-1)!
  const [x, ...restTop] = top.cards
  const [y, ...restHand] = handOf(state, id)
  return {
    ...state,
    pile: [...state.pile.slice(0, -1), { ...top, cards: [y!, ...restTop] }],
    hands: { ...state.hands, [id]: [x!, ...restHand] },
  }
}

/** Moves every pile card along one place (across plays), keeping each play's size. */
function rotatePile(state: CheatState): CheatState {
  const all = state.pile.flatMap((p) => p.cards)
  const rotated = [...all.slice(1), all[0]!]
  let i = 0
  return { ...state, pile: state.pile.map((p) => ({ ...p, cards: p.cards.map(() => rotated[i++]!) })) }
}

// ---------------------------------------------------------------- module

export const cheat = defineGame<CheatState, ClientAction, CheatTimer, CheatView, CheatSettings>({
  ...meta,
  settingsSchema,
  defaultSettings,
  actionSchema: clientActionSchema,

  init: (ctx) => startGame(null, ctx),
  reduce,
  onTimer,
  view,

  onPlayerDisconnected(state, playerId, ctx) {
    if (state.phase === 'PLAYING' && state.turn === playerId) return { state, effects: [scheduleTurnSkip(state, ctx)] }
    return { state }
  },

  onPlayerReconnected(state, playerId) {
    if (state.phase === 'PLAYING' && state.turn === playerId) return { state, effects: [cancelSkip] }
    return { state }
  },

  onPlayerRemoved(state, playerId, ctx) {
    const scores = withoutPlayer(state.scores, playerId)
    if (!playing(state).includes(playerId)) return { state: { ...state, scores } }

    // The seat stays, so the table keeps its shape; the hand is set aside, out of the game.
    const next: CheatState = {
      ...state,
      scores,
      left: [...state.left, playerId],
      hands: { ...state.hands, [playerId]: [] },
      // Nobody is left to pick up the pile if their play were called.
      open: state.open && state.pile.at(-1)?.playerId !== playerId,
    }
    if (state.phase !== 'PLAYING') return { state: next }

    if (playing(next).length < MIN_PLAYERS) {
      return abandonGame(next, [{ type: 'notice', to: 'all', message: 'Not enough players left to finish the game.' }])
    }
    const notice: Effect<CheatTimer> = { type: 'notice', to: 'all', message: 'A player left, so their cards were set aside.' }
    if (state.turn === playerId) return enterTurn(next, nextSeat(state, playerId), ctx, [notice])
    return { state: next, effects: [notice] }
  },

  secrets: [
    {
      name: 'hands',
      visibleTo: () => false,
      // Each other hand swaps a card with the next other hand. One swap per hand keeps the leak test fast.
      variants: (s, viewerId) => {
        const others = playing(s).filter((id) => id !== viewerId && handOf(s, id).length > 0)
        return others.flatMap((a, i) => (others[i + 1] ? [swapHands(s, a, others[i + 1]!)] : []))
      },
    },
    {
      name: 'pile',
      // Hidden from the players who put the cards there too; only a call turns any up.
      visibleTo: () => false,
      variants: (s, viewerId) => {
        if (s.pile.length === 0) return []
        const variants = [rotatePile(s)]
        const other = playing(s).find((id) => id !== viewerId && handOf(s, id).length > 0)
        if (other) variants.push(swapTopWithHand(s, other))
        return variants
      },
    },
  ],
})
