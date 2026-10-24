/**
 * Gone Fishin': pure init / reduce / onTimer / view, plus the secrets spec checked by
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
  RANKS,
  sortCards,
  standardDeck,
  withoutPlayer,
  type Card,
  type Rank,
} from '@wsfg/core/kit'
import {
  clientActionSchema,
  defaultSettings,
  handSize,
  meta,
  MIN_PLAYERS,
  settingsSchema,
  TOTAL_BOOKS,
  type ClientAction,
  type GoneFishinSettings,
  type GoneFishinView,
  type Move,
  type Phase,
} from '../shared/index.ts'

// ---------------------------------------------------------------- state

export interface GoneFishinState {
  /** Snapshot at game start; settings only change in the lobby. */
  settings: GoneFishinSettings
  phase: Phase
  /** Counts games, so stale timers can tell they're stale. */
  game: number
  /** This game's players in seat order, leavers included. Late joiners wait for the next game. */
  seats: PlayerId[]
  /** Seats whose player left this game. */
  left: PlayerId[]
  /** Secret to everyone but the owner. */
  hands: Record<PlayerId, Card[]>
  /** Face down; the top card is index 0. Secret to everyone. */
  pond: Card[]
  books: Record<PlayerId, Rank[]>
  turn: PlayerId | null
  /** Bumped on every turn change; a skip timer for an older turn is a no-op. */
  turnSeq: number
  log: Move[]
  outcome: 'win' | 'abandoned' | null
  winnerIds: PlayerId[]
  scores: Record<PlayerId, number>
}

/** Scheduled by the game itself and handled by onTimer; clients can't send these. */
export type GoneFishinTimer = { type: 'turn_skip'; game: number; turnSeq: number }

type Ctx = BaseCtx<GoneFishinSettings>
type Step = Transition<GoneFishinState, GoneFishinTimer>
type Fx = Effect<GoneFishinTimer>[]

const cancelSkip: Effect<GoneFishinTimer> = { type: 'cancel', key: 'turn_skip' }

// ---------------------------------------------------------------- helpers

function playing(state: GoneFishinState): PlayerId[] {
  return state.seats.filter((id) => !state.left.includes(id))
}

const handOf = (state: GoneFishinState, id: PlayerId): Card[] => state.hands[id] ?? []

function bookCount(state: GoneFishinState): number {
  return Object.values(state.books).reduce((sum, books) => sum + books.length, 0)
}

/** The next seat after `id` still in the game (wrapping round); `id` itself if nobody else is. */
function nextSeat(state: GoneFishinState, id: PlayerId): PlayerId {
  const from = state.seats.indexOf(id)
  const n = state.seats.length
  for (let i = 1; i < n; i++) {
    const seat = state.seats[(from + i) % n]!
    if (!state.left.includes(seat)) return seat
  }
  return id
}

/** Lays down every complete rank in `id`'s hand; returns the new state and the ranks booked. */
function layBooks(state: GoneFishinState, id: PlayerId): { state: GoneFishinState; booked: Rank[] } {
  const hand = handOf(state, id)
  const booked = RANKS.filter((rank) => hand.filter((c) => c.rank === rank).length === 4)
  if (booked.length === 0) return { state, booked }
  return {
    state: {
      ...state,
      hands: { ...state.hands, [id]: hand.filter((c) => !booked.includes(c.rank)) },
      books: { ...state.books, [id]: [...(state.books[id] ?? []), ...booked] },
    },
    booked,
  }
}

/** `id` takes the top card of the pond (which must not be empty). */
function draw(state: GoneFishinState, id: PlayerId): { state: GoneFishinState; card: Card } {
  const [card, ...pond] = state.pond
  return { state: { ...state, pond, hands: { ...state.hands, [id]: [...handOf(state, id), card!] } }, card: card! }
}

// ---------------------------------------------------------------- transitions

function startGame(prev: GoneFishinState | null, ctx: Ctx): Step {
  const ids = ctx.players.map((p) => p.id)
  // 'rotate' keeps everyone's place round the table and moves the first turn on one seat.
  const seats = nextTurnOrder(prev?.seats ?? null, ids, ctx.rng, 'rotate')
  const { hands, rest } = deal(ctx.rng.shuffle(standardDeck()), seats, handSize(seats.length))
  let state: GoneFishinState = {
    settings: ctx.settings,
    phase: 'PLAYING',
    game: (prev?.game ?? 0) + 1,
    seats,
    left: [],
    hands,
    pond: rest,
    books: Object.fromEntries(seats.map((id) => [id, []])),
    turn: null,
    turnSeq: prev?.turnSeq ?? 0,
    log: [],
    outcome: null,
    winnerIds: [],
    scores: carryScores(prev?.scores, ids),
  }
  for (const id of seats) state = layBooks(state, id).state
  return advanceTo(state, seats[0]!, ctx)
}

/**
 * Hands the turn to `id`, or past them, applying the automatic draws: an empty hand draws one
 * card (rule 4), and a player nobody can be asked by draws and passes (rule 5). Seats with
 * nothing to draw are skipped. Ends the game once every book is down.
 */
function advanceTo(state: GoneFishinState, id: PlayerId, ctx: Ctx, effects: Fx = []): Step {
  let s = state
  let current = id
  // Each pass either hands over the turn, draws a card or skips a seat with nothing to play,
  // and all 52 cards end in books, so this ends; the bound only guards against a bug.
  for (let guard = 0; guard < 200; guard++) {
    if (bookCount(s) >= TOTAL_BOOKS) return finishGame(s, effects)
    if (handOf(s, current).length === 0) {
      if (s.pond.length === 0) {
        current = nextSeat(s, current)
        continue
      }
      s = draw(s, current).state
    }
    if (playing(s).some((other) => other !== current && handOf(s, other).length > 0)) return enterTurn(s, current, ctx, effects)
    if (s.pond.length > 0) {
      const drawn = layBooks(draw(s, current).state, current)
      const move: Move = { askerId: current, targetId: null, rank: null, given: 0, drew: true, lucky: false, books: drawn.booked }
      s = { ...drawn.state, log: [...drawn.state.log, move] }
    }
    current = nextSeat(s, current)
  }
  throw new Error('gonefishin: no player could take a turn')
}

function enterTurn(state: GoneFishinState, playerId: PlayerId, ctx: Ctx, effects: Fx): Step {
  const next = { ...state, turn: playerId, turnSeq: state.turnSeq + 1 }
  effects.push(cancelSkip)
  if (!isConnected(ctx, playerId)) effects.push(scheduleTurnSkip(next, ctx))
  return { state: next, effects }
}

function scheduleTurnSkip(state: GoneFishinState, ctx: Ctx): Effect<GoneFishinTimer> {
  return {
    type: 'schedule',
    key: 'turn_skip',
    at: ctx.now + DISCONNECT_GRACE_MS,
    action: { type: 'turn_skip', game: state.game, turnSeq: state.turnSeq },
  }
}

/** Most books wins; ties each score a point. Leavers can't win. */
function finishGame(state: GoneFishinState, effects: Fx = []): Step {
  const counts = playing(state).map((id) => [id, state.books[id]?.length ?? 0] as const)
  const top = Math.max(...counts.map(([, n]) => n))
  const winnerIds = counts.filter(([, n]) => n === top).map(([id]) => id)
  return {
    state: {
      ...state,
      phase: 'RESULTS',
      turn: null,
      outcome: 'win',
      winnerIds,
      scores: addPoints(state.scores, Object.fromEntries(winnerIds.map((id) => [id, 1]))),
    },
    effects: [...effects, cancelSkip],
  }
}

function abandonGame(state: GoneFishinState, effects: Fx): Step {
  return {
    state: { ...state, phase: 'RESULTS', turn: null, outcome: 'abandoned', winnerIds: [] },
    effects: [...effects, cancelSkip],
  }
}

function ask(state: GoneFishinState, askerId: PlayerId, targetId: PlayerId, rank: Rank, ctx: Ctx): Step {
  const given = handOf(state, targetId).filter((c) => c.rank === rank)
  if (given.length > 0) {
    const handed: GoneFishinState = {
      ...state,
      hands: {
        ...state.hands,
        [targetId]: handOf(state, targetId).filter((c) => c.rank !== rank),
        [askerId]: [...handOf(state, askerId), ...given],
      },
    }
    const { state: s, booked } = layBooks(handed, askerId)
    const move: Move = { askerId, targetId, rank, given: given.length, drew: false, lucky: false, books: booked }
    return advanceTo({ ...s, log: [...s.log, move] }, askerId, ctx)
  }

  // Gone fishin'.
  if (state.pond.length === 0) {
    const move: Move = { askerId, targetId, rank, given: 0, drew: false, lucky: false, books: [] }
    return advanceTo({ ...state, log: [...state.log, move] }, nextSeat(state, askerId), ctx)
  }
  const drawn = draw(state, askerId)
  const lucky = state.settings.luckyCatch && drawn.card.rank === rank
  const { state: s, booked } = layBooks(drawn.state, askerId)
  const move: Move = { askerId, targetId, rank, given: 0, drew: true, lucky, books: booked }
  return advanceTo({ ...s, log: [...s.log, move] }, lucky ? askerId : nextSeat(s, askerId), ctx)
}

// ---------------------------------------------------------------- reducer

function reduce(state: GoneFishinState, action: ClientAction, ctx: ReduceCtx<GoneFishinSettings>): Step | GameError {
  const actor = ctx.actorId

  switch (action.type) {
    case 'ask': {
      if (state.phase !== 'PLAYING') return gameError('The game is over')
      if (actor !== state.turn) return gameError("It's not your turn")
      if (!handOf(state, actor).some((c) => c.rank === action.rank)) return gameError('You can only ask for a rank you hold')
      if (action.targetId === actor) return gameError("You can't ask yourself")
      if (!playing(state).includes(action.targetId)) return gameError("That player isn't in this game")
      if (handOf(state, action.targetId).length === 0) return gameError('That player has no cards')
      return ask(state, actor, action.targetId, action.rank, ctx)
    }

    case 'new_game':
      if (actor !== ctx.hostId) return gameError('Only the host can start a new game')
      if (state.phase !== 'RESULTS') return gameError('The game is not over yet')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startGame(state, ctx)
  }
}

/** Stale timers are no-ops. */
function onTimer(state: GoneFishinState, action: GoneFishinTimer, ctx: TimerCtx<GoneFishinSettings>): Step {
  if (state.phase !== 'PLAYING' || action.game !== state.game || action.turnSeq !== state.turnSeq) return { state }
  if (state.turn === null || isConnected(ctx, state.turn)) return { state }
  return advanceTo(state, nextSeat(state, state.turn), ctx)
}

// ---------------------------------------------------------------- view

function view(state: GoneFishinState, viewerId: PlayerId): GoneFishinView {
  const seated = playing(state).includes(viewerId)
  return {
    phase: state.phase,
    game: state.game,
    luckyCatch: state.settings.luckyCatch,
    you: { status: seated ? 'playing' : 'waiting', hand: seated ? sortCards(handOf(state, viewerId)) : [] },
    seats: state.seats.map((id) => ({
      id,
      cards: handOf(state, id).length,
      books: state.books[id] ?? [],
      left: state.left.includes(id),
    })),
    pond: state.pond.length,
    turn: state.phase === 'PLAYING' ? state.turn : null,
    log: state.log,
    outcome: state.phase === 'RESULTS' ? state.outcome : null,
    winnerIds: state.phase === 'RESULTS' ? state.winnerIds : [],
    scores: state.scores,
  }
}

// ---------------------------------------------------------------- secrets

/** Swaps the first card of two places (a hand or the pond). */
function swapFirst(state: GoneFishinState, a: PlayerId | 'pond', b: PlayerId | 'pond'): GoneFishinState {
  const get = (where: PlayerId | 'pond') => (where === 'pond' ? state.pond : handOf(state, where))
  const [x, ...restA] = get(a)
  const [y, ...restB] = get(b)
  const hands = { ...state.hands }
  let pond = state.pond
  const put = (where: PlayerId | 'pond', cards: Card[]) => {
    if (where === 'pond') pond = cards
    else hands[where] = cards
  }
  put(a, [y!, ...restA])
  put(b, [x!, ...restB])
  return { ...state, hands, pond }
}

// ---------------------------------------------------------------- module

export const goneFishin = defineGame<GoneFishinState, ClientAction, GoneFishinTimer, GoneFishinView, GoneFishinSettings>({
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

    // The seat stays, so the table keeps its shape and the leaver's books stay down.
    const next: GoneFishinState = {
      ...state,
      scores,
      left: [...state.left, playerId],
      hands: { ...state.hands, [playerId]: [] },
      pond: state.phase === 'PLAYING' ? ctx.rng.shuffle([...state.pond, ...handOf(state, playerId)]) : state.pond,
    }
    if (state.phase !== 'PLAYING') return { state: next }

    if (playing(next).length < MIN_PLAYERS) {
      return abandonGame(next, [{ type: 'notice', to: 'all', message: 'Not enough players left to finish the game.' }])
    }
    const notice: Effect<GoneFishinTimer> = { type: 'notice', to: 'all', message: 'A player left, so their cards went back into the pond.' }
    // Re-entering the current turn too: the leaver may have been the only other player with cards.
    return advanceTo(next, state.turn === playerId ? nextSeat(state, playerId) : state.turn!, ctx, [notice])
  },

  secrets: [
    {
      name: 'cards',
      visibleTo: () => false,
      // Each other hand swaps a card with the next other hand (or the pond, for the last one),
      // and the pond is reordered. One swap per hand keeps the leak test fast.
      variants: (s, viewerId) => {
        const others = playing(s).filter((id) => id !== viewerId && handOf(s, id).length > 0)
        const variants = others.flatMap((a, i) => {
          const b = others[i + 1] ?? (s.pond.length > 0 ? 'pond' : null)
          return b ? [swapFirst(s, a, b)] : []
        })
        if (s.pond.length > 1) variants.push({ ...s, pond: [...s.pond].reverse() })
        return variants
      },
    },
  ],
})
