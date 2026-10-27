/**
 * Old Maid: pure init / reduce / onTimer / view, plus the secrets spec checked by
 * the core leak test. The deck and hands are shuffled with ctx.rng; there is no I/O at all.
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
} from '@wsfg/core/contract'
import {
  addPoints,
  carryScores,
  deal,
  DISCONNECT_GRACE_MS,
  isConnected,
  nextTurnOrder,
  standardDeck,
  withoutPlayer,
  type Card,
} from '@wsfg/core/kit'
import {
  clientActionSchema,
  defaultSettings,
  meta,
  MIN_PLAYERS,
  pairKey,
  REMOVED_CARD,
  settingsSchema,
  type ClientAction,
  type Move,
  type OldMaidSettings,
  type OldMaidView,
  type Phase,
  type YouStatus,
} from '../shared/index.ts'

// ---------------------------------------------------------------- state

export interface OldMaidState {
  /** Snapshot at round start; settings only change in the lobby. */
  settings: OldMaidSettings
  phase: Phase
  /** Counts every deal, so stale timers can tell they're stale. */
  deal: number
  /** Classic: rounds played. Royale: Royales started. */
  game: number
  /** Royale: this Royale's round, from 1. */
  round: number
  /** Seat order for this game (Classic: this round; Royale: this Royale), leavers and the eliminated included. */
  table: PlayerId[]
  /** Dealt in this round, in seat order. Late joiners wait for the next game. */
  dealt: PlayerId[]
  /** Royale: caught as the Old Maid in an earlier round of this Royale. */
  eliminated: PlayerId[]
  /** Left during this game. */
  left: PlayerId[]
  /** Who took the round's first turn; the next round starts one seat on. */
  starter: PlayerId
  /** Secret to everyone but the owner; the order (what the next player draws from) is secret too. */
  hands: Record<PlayerId, Card[]>
  /** Pairs thrown this round, oldest first. Public. */
  discard: [Card, Card][]
  pairs: Record<PlayerId, number>
  /** This round's players in the order their hands emptied. */
  out: PlayerId[]
  turn: PlayerId | null
  /** Bumped on every turn change; an away-draw timer for an older turn is a no-op. */
  turnSeq: number
  log: Move[]
  outcome: 'maid' | 'abandoned' | null
  maidId: PlayerId | null
  maidCard: Card | null
  royaleWinnerId: PlayerId | null
  scores: Record<PlayerId, number>
}

/** Scheduled by the game itself and handled by onTimer; clients can't send these. */
export type OldMaidTimer = { type: 'away_draw'; deal: number; turnSeq: number }

type Ctx = BaseCtx<OldMaidSettings>
type Step = Transition<OldMaidState, OldMaidTimer>
type Fx = Effect<OldMaidTimer>[]

const cancelAway: Effect<OldMaidTimer> = { type: 'cancel', key: 'away_draw' }

// ---------------------------------------------------------------- helpers

const handOf = (state: OldMaidState, id: PlayerId): Card[] => state.hands[id] ?? []

/** Dealt in this round and still here. */
function inRound(state: OldMaidState): PlayerId[] {
  return state.dealt.filter((id) => !state.left.includes(id))
}

function holders(state: OldMaidState): PlayerId[] {
  return inRound(state).filter((id) => handOf(state, id).length > 0)
}

/** Royale: players still in the Royale. */
function remaining(state: OldMaidState): PlayerId[] {
  return state.table.filter((id) => !state.eliminated.includes(id) && !state.left.includes(id))
}

/** The next player holding cards after `id` (step 1 clockwise, -1 anticlockwise), never `id`; null if nobody else holds any. */
function nextHolder(state: OldMaidState, id: PlayerId, step: 1 | -1): PlayerId | null {
  const seats = state.dealt
  const n = seats.length
  const from = seats.indexOf(id)
  const holding = holders(state)
  for (let i = 1; i < n; i++) {
    const seat = seats[(((from + i * step) % n) + n) % n]!
    if (holding.includes(seat)) return seat
  }
  return null
}

/** `id` if they hold cards, else the next player clockwise who does. */
function holderFrom(state: OldMaidState, id: PlayerId): PlayerId | null {
  return holders(state).includes(id) ? id : nextHolder(state, id, 1)
}

/** Who the turn player draws from: the previous player still holding cards. */
function fromOf(state: OldMaidState, turn: PlayerId): PlayerId | null {
  return nextHolder(state, turn, -1)
}

/** Royale: the next round deals the players still in, rather than starting a new Royale. */
function royaleGoesOn(state: OldMaidState): boolean {
  return (
    state.settings.format === 'royale' &&
    state.phase === 'RESULTS' &&
    state.outcome === 'maid' &&
    state.royaleWinnerId === null &&
    remaining(state).length >= MIN_PLAYERS
  )
}

/** Throws out every pair in a dealt hand (the first two of a kind, for three); keeps the rest in order. */
function throwPairs(hand: readonly Card[], matchColour: boolean): { kept: Card[]; pairs: [Card, Card][] } {
  const kept: Card[] = []
  const pairs: [Card, Card][] = []
  for (const card of hand) {
    const i = kept.findIndex((c) => pairKey(c, matchColour) === pairKey(card, matchColour))
    if (i === -1) kept.push(card)
    else pairs.push([kept.splice(i, 1)[0]!, card])
  }
  return { kept, pairs }
}

/**
 * `card` joins `id`'s hand at a random place, so where it sits tells the next drawer nothing.
 * If it pairs, the pair goes down instead.
 */
function receive(state: OldMaidState, id: PlayerId, card: Card, ctx: Ctx): { state: OldMaidState; pair: [Card, Card] | null } {
  const hand = handOf(state, id)
  const match = hand.findIndex((c) => pairKey(c, state.settings.matchColour) === pairKey(card, state.settings.matchColour))
  if (match !== -1) {
    const pair: [Card, Card] = [hand[match]!, card]
    return {
      state: {
        ...state,
        hands: { ...state.hands, [id]: hand.filter((_, i) => i !== match) },
        discard: [...state.discard, pair],
        pairs: { ...state.pairs, [id]: (state.pairs[id] ?? 0) + 1 },
      },
      pair,
    }
  }
  const at = ctx.rng.int(hand.length + 1)
  return { state: { ...state, hands: { ...state.hands, [id]: [...hand.slice(0, at), card, ...hand.slice(at)] } }, pair: null }
}

/** Players who hold no cards now and aren't yet recorded as out, in seat order. */
function newlyOut(state: OldMaidState, among: readonly PlayerId[]): PlayerId[] {
  return among.filter((id) => !state.out.includes(id) && handOf(state, id).length === 0)
}

/** Deals the whole deck from the starter round; when it doesn't divide, the first seats get one more. */
function dealAll(deck: Card[], seats: PlayerId[]): Record<PlayerId, Card[]> {
  const { hands, rest } = deal(deck, seats, Math.floor(deck.length / seats.length))
  rest.forEach((card, i) => hands[seats[i]!]!.push(card))
  return hands
}

/** `seats` turned so `first` comes first. */
function from(seats: readonly PlayerId[], first: PlayerId): PlayerId[] {
  const i = Math.max(0, seats.indexOf(first))
  return [...seats.slice(i), ...seats.slice(0, i)]
}

// ---------------------------------------------------------------- transitions

/** A new round: the next one of a Royale that goes on, or else a new game for everyone present. */
function startRound(prev: OldMaidState | null, ctx: Ctx): Step {
  const ids = ctx.players.map((p) => p.id)
  const goesOn = prev !== null && royaleGoesOn(prev)
  let table: PlayerId[]
  let starter: PlayerId
  if (goesOn) {
    // Same seats; the first turn moves on to the next player still in.
    table = prev.table
    const still = remaining(prev)
    const at = table.indexOf(prev.starter)
    starter = still[0]!
    for (let i = 1; i <= table.length; i++) {
      const seat = table[(at + i) % table.length]!
      if (still.includes(seat)) {
        starter = seat
        break
      }
    }
  } else {
    // 'rotate' keeps everyone's place round the table and moves the first turn on one seat.
    table = nextTurnOrder(prev?.table ?? null, ids, ctx.rng, 'rotate')
    starter = table[0]!
  }
  const eliminated = goesOn ? prev.eliminated : []
  const left = goesOn ? prev.left : []
  const dealt = table.filter((id) => !eliminated.includes(id) && !left.includes(id))

  const deck = ctx.rng.shuffle(standardDeck().filter((c) => c.rank !== REMOVED_CARD.rank || c.suit !== REMOVED_CARD.suit))
  const dealtHands = dealAll(deck, from(dealt, starter))
  const hands: Record<PlayerId, Card[]> = {}
  const pairs: Record<PlayerId, number> = {}
  const discard: [Card, Card][] = []
  for (const id of dealt) {
    const thrown = throwPairs(dealtHands[id]!, ctx.settings.matchColour)
    hands[id] = thrown.kept
    pairs[id] = thrown.pairs.length
    discard.push(...thrown.pairs)
  }

  const state: OldMaidState = {
    settings: ctx.settings,
    phase: 'PLAYING',
    deal: (prev?.deal ?? 0) + 1,
    game: goesOn ? prev.game : (prev?.game ?? 0) + 1,
    round: goesOn ? prev.round + 1 : 1,
    table,
    dealt,
    eliminated,
    left,
    starter,
    hands,
    discard,
    pairs,
    out: [],
    turn: null,
    turnSeq: prev?.turnSeq ?? 0,
    log: [],
    outcome: null,
    maidId: null,
    maidCard: null,
    royaleWinnerId: null,
    scores: carryScores(prev?.scores, ids),
  }
  return carryOn({ ...state, out: newlyOut(state, from(dealt, starter)) }, starter, ctx, [cancelAway])
}

/** Ends the round if one player is left holding cards; otherwise the turn goes to `next` (or past them, to someone holding cards). */
function carryOn(state: OldMaidState, next: PlayerId, ctx: Ctx, effects: Fx = []): Step {
  if (holders(state).length <= 1) return finishRound(state, effects)
  return enterTurn(state, holderFrom(state, next)!, ctx, effects)
}

function enterTurn(state: OldMaidState, playerId: PlayerId, ctx: Ctx, effects: Fx): Step {
  const next = { ...state, turn: playerId, turnSeq: state.turnSeq + 1 }
  effects.push(cancelAway)
  if (!isConnected(ctx, playerId)) effects.push(scheduleAwayDraw(next, ctx))
  return { state: next, effects }
}

function scheduleAwayDraw(state: OldMaidState, ctx: Ctx): Effect<OldMaidTimer> {
  return {
    type: 'schedule',
    key: 'away_draw',
    at: ctx.now + DISCONNECT_GRACE_MS,
    action: { type: 'away_draw', deal: state.deal, turnSeq: state.turnSeq },
  }
}

/**
 * The last player holding cards is the Old Maid. Classic: everyone else dealt in scores 1.
 * Royale: the Old Maid is eliminated, and the last player in wins the Royale and scores 1.
 */
function finishRound(state: OldMaidState, effects: Fx = []): Step {
  const maidId = holders(state)[0] ?? null
  if (maidId === null) return abandonRound(state, effects) // can't happen: 51 cards never all pair
  const done = { ...state, phase: 'RESULTS' as const, turn: null, outcome: 'maid' as const, maidId, maidCard: handOf(state, maidId)[0]! }
  if (state.settings.format === 'classic') {
    const points = Object.fromEntries(inRound(state).filter((id) => id !== maidId).map((id) => [id, 1]))
    return { state: { ...done, scores: addPoints(state.scores, points) }, effects: [...effects, cancelAway] }
  }
  const eliminated = [...state.eliminated, maidId]
  const still = state.table.filter((id) => !eliminated.includes(id) && !state.left.includes(id))
  const royaleWinnerId = still.length === 1 ? still[0]! : null
  return {
    state: { ...done, eliminated, royaleWinnerId, scores: royaleWinnerId ? addPoints(state.scores, { [royaleWinnerId]: 1 }) : state.scores },
    effects: [...effects, cancelAway],
  }
}

function abandonRound(state: OldMaidState, effects: Fx): Step {
  return {
    state: { ...state, phase: 'RESULTS', turn: null, outcome: 'abandoned', maidId: null, maidCard: null, royaleWinnerId: null },
    effects: [...effects, cancelAway],
  }
}

/** `drawerId` takes the card at `index` of the previous holder's hand. */
function draw(state: OldMaidState, drawerId: PlayerId, index: number, away: boolean, ctx: Ctx): Step {
  const fromId = fromOf(state, drawerId)!
  // The order the giver sees is the order the drawer picks from, as at a table.
  const offered = handOf(state, fromId)
  const card = offered[index]!
  const taken: OldMaidState = { ...state, hands: { ...state.hands, [fromId]: offered.filter((_, i) => i !== index) } }
  const { state: s, pair } = receive(taken, drawerId, card, ctx)
  const out = newlyOut(s, [fromId, drawerId])
  const move: Move = { drawerId, fromId, index, card, pair, out, away }
  return carryOn({ ...s, out: [...s.out, ...out], log: [...s.log, move] }, nextHolder(s, drawerId, 1) ?? drawerId, ctx)
}

// ---------------------------------------------------------------- reducer

function reduce(state: OldMaidState, action: ClientAction, ctx: ReduceCtx<OldMaidSettings>): Step | GameError {
  const actor = ctx.actorId

  switch (action.type) {
    case 'draw': {
      if (state.phase !== 'PLAYING') return gameError('The round is over')
      if (actor !== state.turn) return gameError("It's not your turn")
      const fromId = fromOf(state, actor)
      if (!fromId || action.index >= handOf(state, fromId).length) return gameError('Pick one of their cards')
      return draw(state, actor, action.index, false, ctx)
    }

    case 'arrange': {
      const hand = handOf(state, actor)
      if (!state.settings.arrange) return gameError('Arrange hand is off')
      const problem = handProblem(state, actor)
      if (problem) return gameError(problem)
      const order = action.order
      if (order.length !== hand.length || new Set(order).size !== hand.length || order.some((i) => i >= hand.length)) {
        return gameError('Your hand changed. Try again')
      }
      return { state: { ...state, hands: { ...state.hands, [actor]: order.map((i) => hand[i]!) } } }
    }

    case 'shuffle': {
      const problem = handProblem(state, actor)
      if (problem) return gameError(problem)
      return { state: { ...state, hands: { ...state.hands, [actor]: ctx.rng.shuffle(handOf(state, actor)) } } }
    }

    case 'next_round':
      if (actor !== ctx.hostId) return gameError('Only the host can start the next round')
      if (state.phase !== 'RESULTS') return gameError('The round is not over yet')
      if (!royaleGoesOn(state) && ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startRound(state, ctx)
  }
}

/** Why `id` can't reorder their hand right now, or null if they can. Shuffling is always allowed; arranging needs the setting too. */
function handProblem(state: OldMaidState, id: PlayerId): string | null {
  if (state.phase !== 'PLAYING') return 'The round is over'
  if (!holders(state).includes(id)) return 'You have no cards'
  return null
}

/** Stale timers are no-ops. Drawing is blind, so a random draw is the move the player would make. */
function onTimer(state: OldMaidState, action: OldMaidTimer, ctx: TimerCtx<OldMaidSettings>): Step {
  if (state.phase !== 'PLAYING' || action.deal !== state.deal || action.turnSeq !== state.turnSeq) return { state }
  if (state.turn === null || isConnected(ctx, state.turn)) return { state }
  const fromId = fromOf(state, state.turn)
  if (!fromId) return { state }
  return draw(state, state.turn, ctx.rng.int(handOf(state, fromId).length), true, ctx)
}

// ---------------------------------------------------------------- view

function view(state: OldMaidState, viewerId: PlayerId): OldMaidView {
  const atTable = state.table.includes(viewerId) && !state.left.includes(viewerId)
  const dealt = atTable && state.dealt.includes(viewerId)
  const hand = dealt ? handOf(state, viewerId) : []
  const status: YouStatus = !atTable
    ? 'waiting'
    : state.eliminated.includes(viewerId) && !(state.phase === 'RESULTS' && state.maidId === viewerId)
      ? 'eliminated'
      : !dealt
        ? 'waiting'
        : hand.length === 0
          ? 'out'
          : 'playing'
  const playing = state.phase === 'PLAYING'
  const results = state.phase === 'RESULTS'
  return {
    phase: state.phase,
    game: state.game,
    round: state.round,
    settings: state.settings,
    you: { status, hand },
    seats: state.table.map((id) => ({
      id,
      cards: handOf(state, id).length,
      pairs: state.pairs[id] ?? 0,
      outPlace: state.out.includes(id) ? state.out.indexOf(id) + 1 : null,
      inRound: state.dealt.includes(id),
      // The Old Maid just caught stays at the table for the reveal; they sit out from the next round.
      eliminated: state.eliminated.includes(id) && !(results && state.maidId === id),
      left: state.left.includes(id),
    })),
    discard: state.discard,
    turn: playing ? state.turn : null,
    from: playing && state.turn ? fromOf(state, state.turn) : null,
    log: state.log.map((m) => ({ ...m, card: m.pair || m.drawerId === viewerId || m.fromId === viewerId ? m.card : null })),
    outcome: results ? state.outcome : null,
    maidId: results ? state.maidId : null,
    maidCard: results ? state.maidCard : null,
    royaleWinnerId: results ? state.royaleWinnerId : null,
    royaleGoesOn: royaleGoesOn(state),
    scores: state.scores,
  }
}

// ---------------------------------------------------------------- secrets

/** Swaps the first card of two hands. */
function swapFirst(state: OldMaidState, a: PlayerId, b: PlayerId): OldMaidState {
  const [x, ...restA] = handOf(state, a)
  const [y, ...restB] = handOf(state, b)
  return { ...state, hands: { ...state.hands, [a]: [y!, ...restA], [b]: [x!, ...restB] } }
}

/** A card that isn't `card`, to stand in for it. */
const otherCard = (card: Card | null): Card => (card?.rank === 'K' && card.suit === 'S' ? { rank: 'A', suit: 'S' } : { rank: 'K', suit: 'S' })

// ---------------------------------------------------------------- module

export const oldMaid = defineGame<OldMaidState, ClientAction, OldMaidTimer, OldMaidView, OldMaidSettings>({
  ...meta,
  settingsSchema,
  defaultSettings,
  actionSchema: clientActionSchema,

  init: (ctx) => startRound(null, ctx),
  reduce,
  onTimer,
  view,

  onPlayerDisconnected(state, playerId, ctx) {
    if (state.phase === 'PLAYING' && state.turn === playerId) return { state, effects: [scheduleAwayDraw(state, ctx)] }
    return { state }
  },

  onPlayerReconnected(state, playerId) {
    if (state.phase === 'PLAYING' && state.turn === playerId) return { state, effects: [cancelAway] }
    return { state }
  },

  onPlayerRemoved(state, playerId, ctx) {
    const scores = withoutPlayer(state.scores, playerId)
    if (!state.table.includes(playerId) || state.left.includes(playerId)) return { state: { ...state, scores } }

    const wasGoingOn = royaleGoesOn(state)
    const leftHand = handOf(state, playerId)
    // The seat stays (dimmed), so the table keeps its shape.
    let next: OldMaidState = { ...state, scores, left: [...state.left, playerId], hands: { ...state.hands, [playerId]: [] } }

    if (state.phase !== 'PLAYING') {
      if (wasGoingOn && !royaleGoesOn(next)) {
        return { state: next, effects: [{ type: 'notice', to: 'all', message: 'Not enough players are left to finish the Royale.' }] }
      }
      return { state: next }
    }
    if (!state.dealt.includes(playerId)) return { state: next } // eliminated earlier in the Royale

    if (inRound(next).length < MIN_PLAYERS) {
      return abandonRound(next, [{ type: 'notice', to: 'all', message: 'Not enough players left to finish the round.' }])
    }

    // Their cards go round the table one at a time, so the odd queen stays in play.
    const takers: PlayerId[] = []
    for (let id = nextHolder(next, playerId, 1); id !== null && !takers.includes(id); id = nextHolder(next, id, 1)) takers.push(id)
    ctx.rng.shuffle(leftHand).forEach((card, i) => {
      next = receive(next, takers[i % takers.length]!, card, ctx).state
    })
    next = { ...next, out: [...next.out, ...newlyOut(next, takers)] }

    const notice: Effect<OldMaidTimer> = { type: 'notice', to: 'all', message: 'A player left, so their cards were dealt round the table.' }
    const turn = state.turn === playerId ? (nextHolder(next, playerId, 1) ?? playerId) : state.turn!
    return carryOn(next, turn, ctx, leftHand.length > 0 ? [notice] : [])
  },

  secrets: [
    {
      name: 'hands',
      visibleTo: () => false,
      // Each other hand swaps a card with the next other hand.
      variants: (s, viewerId) => {
        const others = s.dealt.filter((id) => id !== viewerId && handOf(s, id).length > 0)
        return others.flatMap((a, i) => {
          const b = others[i + 1]
          return b ? [swapFirst(s, a, b)] : []
        })
      },
    },
    {
      // What the next player draws from: only the owner knows it.
      name: 'hand order',
      visibleTo: () => false,
      variants: (s, viewerId) =>
        s.dealt
          .filter((id) => handOf(s, id).length > 1 && id !== viewerId)
          .map((id) => ({ ...s, hands: { ...s.hands, [id]: [...handOf(s, id)].reverse() } })),
    },
    {
      // A card taken that made no pair: only the drawer and the giver know it.
      name: 'taken cards',
      visibleTo: () => false,
      variants: (s, viewerId) => {
        const hidden = (m: Move) => m.pair === null && m.drawerId !== viewerId && m.fromId !== viewerId
        if (!s.log.some(hidden)) return []
        return [{ ...s, log: s.log.map((m) => (hidden(m) ? { ...m, card: otherCard(m.card) } : m)) }]
      },
    },
  ],
})
