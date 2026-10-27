/**
 * Last Card: pure init / reduce / onTimer / view, plus the secrets spec checked by the core
 * leak test. The deck is shuffled with ctx.rng; there is no I/O at all.
 *
 * PLAYING -> RESULTS -> next_round -> PLAYING
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
} from '@ogn/core/contract'
import { addPoints, carryScores, deal, DISCONNECT_GRACE_MS, isConnected, nextTurnOrder, withoutPlayer } from '@ogn/core/kit'
import {
  canJumpIn,
  canPlay,
  CATCH_PENALTY,
  clientActionSchema,
  defaultSettings,
  HAND_SIZE,
  handPoints,
  isWild,
  lastCardDeck,
  meta,
  MIN_PLAYERS,
  sameCard,
  settingsSchema,
  sortHand,
  type ClientAction,
  type Color,
  type Direction,
  type LastCardSettings,
  type LastCardView,
  type LcCard,
  type Move,
  type Phase,
  type Stage,
  type Table,
} from '../shared/index.ts'

// ---------------------------------------------------------------- state

export interface LastCardState {
  /** Snapshot at round start; settings only change in the lobby. */
  settings: LastCardSettings
  phase: Phase
  /** Counts rounds, so stale timers can tell they're stale. */
  round: number
  game: number
  /** This round's players in seat order, leavers included. Late joiners wait for the next round. */
  seats: PlayerId[]
  /** Seats whose player left this round. */
  left: PlayerId[]
  /** Secret to everyone but the owner until RESULTS. */
  hands: Record<PlayerId, LcCard[]>
  /** Face down; the top card is index 0. Secret to everyone. */
  drawPile: LcCard[]
  /** Face up; the top card is the last. */
  discard: LcCard[]
  color: Color
  turn: PlayerId | null
  /** Bumped on every turn change; a skip timer for an older turn is a no-op. */
  turnSeq: number
  stage: Stage
  /** The card the player to move just drew (stage 'drawn'); secret to everyone else. */
  drawn: LcCard | null
  direction: Direction
  pendingDraw: number
  exposed: PlayerId | null
  log: Move[]
  outcome: 'win' | 'abandoned' | null
  winnerId: PlayerId | null
  roundPoints: number
  champion: PlayerId | null
  /** This game's points (points scoring). */
  points: Record<PlayerId, number>
  scores: Record<PlayerId, number>
}

/** Scheduled by the game itself and handled by onTimer; clients can't send these. */
export type LastCardTimer = { type: 'turn_skip'; round: number; turnSeq: number }

type Ctx = BaseCtx<LastCardSettings>
type Step = Transition<LastCardState, LastCardTimer>
type Fx = Effect<LastCardTimer>[]

const cancelSkip: Effect<LastCardTimer> = { type: 'cancel', key: 'turn_skip' }

// ---------------------------------------------------------------- helpers

function playing(state: LastCardState): PlayerId[] {
  return state.seats.filter((id) => !state.left.includes(id))
}

const handOf = (state: LastCardState, id: PlayerId): LcCard[] => state.hands[id] ?? []

const tableOf = (state: LastCardState): Table => ({ top: state.discard.at(-1)!, color: state.color, pendingDraw: state.pendingDraw })

/** The next seat after `id` still in the round, going `direction` (wrapping round); `id` itself if nobody else is. */
function nextSeat(state: LastCardState, id: PlayerId, direction: Direction = state.direction): PlayerId {
  const from = state.seats.indexOf(id)
  const n = state.seats.length
  for (let i = 1; i < n; i++) {
    const seat = state.seats[(((from + i * direction) % n) + n) % n]!
    if (!state.left.includes(seat)) return seat
  }
  return id
}

const withLog = (state: LastCardState, move: Move): LastCardState => ({ ...state, log: [...state.log, move] })

/**
 * `id` draws `count` cards from the top of the pile, or with `untilPlayable` until one can be
 * played. An empty pile is refilled from the discard pile (all but its top card, shuffled);
 * with nothing left there either, fewer cards are drawn.
 */
function drawCards(state: LastCardState, id: PlayerId, count: number, ctx: Ctx, untilPlayable = false): { state: LastCardState; cards: LcCard[] } {
  let pile = state.drawPile
  let discard = state.discard
  const hand = handOf(state, id)
  const cards: LcCard[] = []
  while (untilPlayable || cards.length < count) {
    if (pile.length === 0) {
      if (discard.length <= 1) break
      pile = ctx.rng.shuffle(discard.slice(0, -1))
      discard = discard.slice(-1)
    }
    const card = pile[0]!
    pile = pile.slice(1)
    cards.push(card)
    if (untilPlayable && canPlay(card, [...hand, ...cards], tableOf(state))) break
  }
  return { state: { ...state, drawPile: pile, discard, hands: { ...state.hands, [id]: [...hand, ...cards] } }, cards }
}

// ---------------------------------------------------------------- transitions

function startRound(prev: LastCardState | null, ctx: Ctx): Step {
  const ids = ctx.players.map((p) => p.id)
  // 'rotate' keeps everyone's place round the table and moves the first turn on one seat.
  const seats = nextTurnOrder(prev?.seats ?? null, ids, ctx.rng, 'rotate')
  const newGame = !prev || prev.champion !== null
  const { hands, rest } = deal(ctx.rng.shuffle(lastCardDeck()), seats, HAND_SIZE)
  // A wild turned up goes back under the pile, and the next card is turned.
  const first = rest.findIndex((c) => !isWild(c))
  const top = rest[first]!
  let state: LastCardState = {
    settings: ctx.settings,
    phase: 'PLAYING',
    round: (prev?.round ?? 0) + 1,
    game: (prev?.game ?? 0) + (newGame ? 1 : 0),
    seats,
    left: [],
    hands,
    drawPile: [...rest.slice(first + 1), ...rest.slice(0, first)],
    discard: [top],
    color: top.color!,
    turn: null,
    turnSeq: prev?.turnSeq ?? 0,
    stage: 'play',
    drawn: null,
    direction: 1,
    pendingDraw: 0,
    exposed: null,
    log: [],
    outcome: null,
    winnerId: null,
    roundPoints: 0,
    champion: null,
    points: carryScores(newGame ? undefined : prev?.points, ids),
    scores: carryScores(prev?.scores, ids),
  }

  // The first card acts as if the dealer, the seat before the first player, had played it;
  // a Reverse has the dealer go first, anticlockwise.
  const dealer = seats.at(-1)!
  switch (top.value) {
    case 'skip':
      return enterTurn(state, nextSeat(state, seats[0]!), ctx)
    case 'reverse':
      return enterTurn({ ...state, direction: -1 }, dealer, ctx)
    case 'draw2':
      state = { ...state, pendingDraw: 2 }
      break
  }
  return enterTurn(state, seats[0]!, ctx)
}

/**
 * Hands the turn to `id`. Without stacking, a pending draw is taken at once and the turn
 * goes on to the next seat; with stacking, `id` gets to answer it.
 */
function enterTurn(state: LastCardState, id: PlayerId, ctx: Ctx, effects: Fx = []): Step {
  let s = state
  let next = id
  if (s.pendingDraw > 0 && !s.settings.stacking) {
    const drawn = drawCards(s, next, s.pendingDraw, ctx)
    s = withLog({ ...drawn.state, pendingDraw: 0 }, { kind: 'draw', playerId: next, count: drawn.cards.length, penalty: true, away: false })
    next = nextSeat(s, next)
  }
  s = { ...s, turn: next, turnSeq: s.turnSeq + 1, stage: 'play', drawn: null }
  effects.push(cancelSkip)
  if (!isConnected(ctx, next)) effects.push(scheduleTurnSkip(s, ctx))
  return { state: s, effects }
}

function scheduleTurnSkip(state: LastCardState, ctx: Ctx): Effect<LastCardTimer> {
  return {
    type: 'schedule',
    key: 'turn_skip',
    at: ctx.now + DISCONNECT_GRACE_MS,
    action: { type: 'turn_skip', round: state.round, turnSeq: state.turnSeq },
  }
}

type PlayAction = Extract<ClientAction, { type: 'play' }>

/** `actorId` plays `action.card` (already checked), in turn or jumping in. */
function play(state: LastCardState, actorId: PlayerId, action: PlayAction, jumpIn: boolean, ctx: Ctx): Step {
  const card = action.card
  const hand = [...handOf(state, actorId)]
  hand.splice(
    hand.findIndex((c) => sameCard(c, card)),
    1,
  )
  const auto = state.settings.lastCall === 'auto'
  const swap = state.settings.sevenZero && hand.length > 0
  const swapWith = swap && card.value === '7' ? action.swapWith! : null
  const color = card.color ?? action.color!
  let s: LastCardState = {
    ...state,
    hands: { ...state.hands, [actorId]: hand },
    discard: [...state.discard, card],
    color,
    // Any play closes the window for catching a missed call.
    exposed: hand.length === 1 && !auto && !action.lastCard ? actorId : null,
  }
  s = withLog(s, { kind: 'play', playerId: actorId, card, color, jumpIn, swapWith, called: hand.length === 1 && (auto || action.lastCard === true) })

  if (card.value === 'draw2') s = { ...s, pendingDraw: s.pendingDraw + 2 }
  if (card.value === 'wild4') s = { ...s, pendingDraw: s.pendingDraw + 4 }
  if (hand.length === 0) return finishRound(s, actorId, ctx)

  if (swapWith) {
    s = { ...s, exposed: null, hands: { ...s.hands, [actorId]: handOf(s, swapWith), [swapWith]: hand } }
  } else if (swap && card.value === '0') {
    // Every hand moves on to the next player in the direction of play.
    const hands = { ...s.hands }
    for (const id of playing(s)) hands[nextSeat(s, id)] = handOf(s, id)
    s = { ...s, exposed: null, hands }
  }

  switch (card.value) {
    case 'skip':
      return enterTurn(s, nextSeat(s, nextSeat(s, actorId)), ctx)
    case 'reverse': {
      const reversed: LastCardState = { ...s, direction: s.direction === 1 ? -1 : 1 }
      // With two players a Reverse acts as a Skip: the same player goes again.
      return enterTurn(reversed, playing(s).length === 2 ? actorId : nextSeat(reversed, actorId), ctx)
    }
    default:
      return enterTurn(s, nextSeat(s, actorId), ctx)
  }
}

/** `winnerId` played their last card; a last draw card still makes the next player draw. */
function finishRound(state: LastCardState, winnerId: PlayerId, ctx: Ctx): Step {
  let s = state
  if (s.pendingDraw > 0) {
    const victim = nextSeat(s, winnerId)
    const drawn = drawCards(s, victim, s.pendingDraw, ctx)
    s = withLog({ ...drawn.state, pendingDraw: 0 }, { kind: 'draw', playerId: victim, count: drawn.cards.length, penalty: true, away: false })
  }
  const roundPoints = playing(s).reduce((sum, id) => sum + handPoints(handOf(s, id)), 0)
  const points = addPoints(s.points, { [winnerId]: roundPoints })
  // With rounds scoring every round is a whole game.
  const won = s.settings.scoring === 'rounds' || points[winnerId]! >= s.settings.target
  return {
    state: {
      ...s,
      phase: 'RESULTS',
      turn: null,
      stage: 'play',
      drawn: null,
      exposed: null,
      outcome: 'win',
      winnerId,
      roundPoints,
      champion: won ? winnerId : null,
      points,
      scores: won ? addPoints(s.scores, { [winnerId]: 1 }) : s.scores,
    },
    effects: [cancelSkip],
  }
}

function abandonRound(state: LastCardState, effects: Fx): Step {
  return {
    state: { ...state, phase: 'RESULTS', turn: null, stage: 'play', drawn: null, exposed: null, pendingDraw: 0, outcome: 'abandoned', winnerId: null },
    effects: [...effects, cancelSkip],
  }
}

/** The player to move draws: a pending stack, or one card (or until playable) to play or keep. */
function draw(state: LastCardState, id: PlayerId, ctx: Ctx): Step {
  const s: LastCardState = { ...state, exposed: null }
  if (s.pendingDraw > 0) {
    const drawn = drawCards(s, id, s.pendingDraw, ctx)
    const next = withLog({ ...drawn.state, pendingDraw: 0 }, { kind: 'draw', playerId: id, count: drawn.cards.length, penalty: true, away: false })
    return enterTurn(next, nextSeat(next, id), ctx)
  }
  const drawn = drawCards(s, id, 1, ctx, s.settings.drawUntilPlayable)
  const next = withLog(drawn.state, { kind: 'draw', playerId: id, count: drawn.cards.length, penalty: false, away: false })
  if (drawn.cards.length === 0) return enterTurn(next, nextSeat(next, id), ctx)
  return { state: { ...next, stage: 'drawn', drawn: drawn.cards.at(-1)! } }
}

// ---------------------------------------------------------------- reducer

function reduce(state: LastCardState, action: ClientAction, ctx: ReduceCtx<LastCardSettings>): Step | GameError {
  const actor = ctx.actorId
  const inRound = playing(state).includes(actor)

  switch (action.type) {
    case 'play': {
      if (state.phase !== 'PLAYING') return gameError('The round is over')
      if (!inRound) return gameError("You're not in this round")
      const hand = handOf(state, actor)
      if (!hand.some((c) => sameCard(c, action.card))) return gameError("You don't have that card")
      const jumpIn = actor !== state.turn
      if (jumpIn) {
        if (!state.settings.jumpIn) return gameError("It's not your turn")
        if (!canJumpIn(action.card, tableOf(state))) return gameError('You can only jump in with a card identical to the top card')
      } else {
        if (state.stage === 'drawn' && !sameCard(action.card, state.drawn!)) return gameError('You can only play the card you drew')
        if (!canPlay(action.card, hand, tableOf(state))) return gameError("That card can't be played now")
      }
      if (isWild(action.card) && !action.color) return gameError('Choose a colour')
      if (state.settings.sevenZero && action.card.value === '7' && hand.length > 1) {
        const target = action.swapWith
        if (!target || target === actor || !playing(state).includes(target)) return gameError('Choose a player to swap hands with')
      }
      return play(state, actor, action, jumpIn, ctx)
    }

    case 'draw':
      if (state.phase !== 'PLAYING') return gameError('The round is over')
      if (actor !== state.turn) return gameError("It's not your turn")
      if (state.stage === 'drawn') return gameError('You have already drawn')
      return draw(state, actor, ctx)

    case 'pass': {
      if (state.phase !== 'PLAYING') return gameError('The round is over')
      if (actor !== state.turn) return gameError("It's not your turn")
      if (state.stage !== 'drawn') return gameError('Play a card or draw first')
      const next = withLog(state, { kind: 'pass', playerId: actor, away: false })
      return enterTurn(next, nextSeat(next, actor), ctx)
    }

    case 'call':
      if (state.phase !== 'PLAYING' || state.exposed !== actor) return gameError('Nothing to call')
      return { state: withLog({ ...state, exposed: null }, { kind: 'call', playerId: actor }) }

    case 'catch': {
      if (state.phase !== 'PLAYING') return gameError('The round is over')
      if (!inRound) return gameError("You're not in this round")
      if (action.targetId === actor) return gameError("You can't catch yourself")
      if (state.exposed !== action.targetId) return gameError('Too late: nobody to catch')
      const drawn = drawCards(state, action.targetId, CATCH_PENALTY, ctx)
      const move: Move = { kind: 'catch', playerId: actor, targetId: action.targetId, count: drawn.cards.length }
      return { state: withLog({ ...drawn.state, exposed: null }, move) }
    }

    case 'next_round':
      if (actor !== ctx.hostId) return gameError('Only the host can start the next round')
      if (state.phase !== 'RESULTS') return gameError('The round is not over yet')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startRound(state, ctx)
  }
}

/** A disconnected player's turn: they take a pending stack, keep a drawn card, or draw one. Stale timers are no-ops. */
function onTimer(state: LastCardState, action: LastCardTimer, ctx: TimerCtx<LastCardSettings>): Step {
  if (state.phase !== 'PLAYING' || action.round !== state.round || action.turnSeq !== state.turnSeq) return { state }
  const id = state.turn
  if (id === null || isConnected(ctx, id)) return { state }
  let s: LastCardState = { ...state, exposed: null }
  if (s.stage === 'drawn') {
    s = withLog(s, { kind: 'pass', playerId: id, away: true })
  } else {
    const drawn = drawCards(s, id, Math.max(1, s.pendingDraw), ctx)
    s = withLog({ ...drawn.state, pendingDraw: 0 }, { kind: 'draw', playerId: id, count: drawn.cards.length, penalty: s.pendingDraw > 0, away: true })
  }
  return enterTurn(s, nextSeat(s, id), ctx)
}

// ---------------------------------------------------------------- view

function view(state: LastCardState, viewerId: PlayerId): LastCardView {
  const seated = playing(state).includes(viewerId)
  const results = state.phase === 'RESULTS'
  return {
    phase: state.phase,
    round: state.round,
    game: state.game,
    settings: state.settings,
    you: {
      status: seated ? 'playing' : 'waiting',
      hand: seated ? sortHand(handOf(state, viewerId)) : [],
      drawn: state.turn === viewerId && state.stage === 'drawn' ? state.drawn : null,
    },
    seats: state.seats.map((id) => ({ id, cards: handOf(state, id).length, left: state.left.includes(id), points: state.points[id] ?? 0 })),
    drawPile: state.drawPile.length,
    top: state.discard.at(-1)!,
    color: state.color,
    turn: results ? null : state.turn,
    stage: state.stage,
    direction: state.direction,
    pendingDraw: state.pendingDraw,
    exposed: state.exposed,
    log: state.log,
    outcome: results ? state.outcome : null,
    winnerId: results ? state.winnerId : null,
    hands: results && state.outcome === 'win' ? Object.fromEntries(playing(state).map((id) => [id, sortHand(handOf(state, id))])) : null,
    roundPoints: results ? state.roundPoints : 0,
    champion: results ? state.champion : null,
    scores: state.scores,
  }
}

// ---------------------------------------------------------------- secrets

/** Swaps the first card of two places (a hand or the draw pile). */
function swapFirst(state: LastCardState, a: PlayerId | 'pile', b: PlayerId | 'pile'): LastCardState {
  const get = (where: PlayerId | 'pile') => (where === 'pile' ? state.drawPile : handOf(state, where))
  const [x, ...restA] = get(a)
  const [y, ...restB] = get(b)
  const hands = { ...state.hands }
  let drawPile = state.drawPile
  const put = (where: PlayerId | 'pile', cards: LcCard[]) => {
    if (where === 'pile') drawPile = cards
    else hands[where] = cards
  }
  put(a, [y!, ...restA])
  put(b, [x!, ...restB])
  return { ...state, hands, drawPile }
}

const RED_ZERO: LcCard = { color: 'red', value: '0' }
const BLUE_ZERO: LcCard = { color: 'blue', value: '0' }

// ---------------------------------------------------------------- module

export const lastCard = defineGame<LastCardState, ClientAction, LastCardTimer, LastCardView, LastCardSettings>({
  ...meta,
  settingsSchema,
  defaultSettings,
  actionSchema: clientActionSchema,

  init: (ctx) => startRound(null, ctx),
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
    const points = withoutPlayer(state.points, playerId)
    if (!playing(state).includes(playerId)) return { state: { ...state, scores, points } }

    // The seat stays, so the table keeps its shape; it's skipped from now on.
    const next: LastCardState = {
      ...state,
      scores,
      points,
      left: [...state.left, playerId],
      hands: { ...state.hands, [playerId]: [] },
      drawPile: state.phase === 'PLAYING' ? ctx.rng.shuffle([...state.drawPile, ...handOf(state, playerId)]) : state.drawPile,
      exposed: state.exposed === playerId ? null : state.exposed,
    }
    if (state.phase !== 'PLAYING') return { state: next }

    if (playing(next).length < MIN_PLAYERS) {
      return abandonRound(next, [{ type: 'notice', to: 'all', message: 'Not enough players left to finish the round.' }])
    }
    const notice: Effect<LastCardTimer> = { type: 'notice', to: 'all', message: 'A player left, so their cards went back into the draw pile.' }
    if (state.turn !== playerId) return { state: next, effects: [notice] }
    // A stack aimed at the leaver goes with them.
    return enterTurn({ ...next, pendingDraw: 0 }, nextSeat(next, playerId), ctx, [notice])
  },

  secrets: [
    {
      name: 'hands',
      visibleTo: (s) => s.phase === 'RESULTS',
      // Each other hand swaps a card with the next other hand (or the pile, for the last one),
      // and another player's drawn card changes. One swap per hand keeps the leak test fast.
      variants: (s, viewerId) => {
        const others = playing(s).filter((id) => id !== viewerId && handOf(s, id).length > 0)
        const variants = others.flatMap((a, i) => {
          const b = others[i + 1] ?? (s.drawPile.length > 0 ? 'pile' : null)
          return b ? [swapFirst(s, a, b)] : []
        })
        if (s.drawn && s.turn !== viewerId) variants.push({ ...s, drawn: sameCard(s.drawn, RED_ZERO) ? BLUE_ZERO : RED_ZERO })
        return variants
      },
    },
    {
      name: 'drawPile',
      visibleTo: () => false,
      variants: (s) => (s.drawPile.length > 1 ? [{ ...s, drawPile: [...s.drawPile].reverse() }] : []),
    },
  ],
})
