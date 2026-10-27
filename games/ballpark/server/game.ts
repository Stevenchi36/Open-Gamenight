/**
 * Ballpark: pure init / reduce / onTimer / view, plus the secrets spec checked
 * by the core leak test. No I/O here; the question arrives through ctx.prepared
 * (from prepareRound) or is picked from the starter list with ctx.rng.
 *
 * GUESSING -> BETTING -> RESULTS -> next_round -> GUESSING   (new_game after the last round)
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
import { addPoints, carryScores, isConnected, withoutPlayer, type Scores } from '@ogn/core/kit'
import {
  clientActionSchema,
  defaultSettings,
  GUESS_BONUS,
  meta,
  MIN_PLAYERS,
  settingsSchema,
  TOO_HIGH,
  TOO_HIGH_ODDS,
  type BallparkSettings,
  type BallparkView,
  type Bet,
  type ClientAction,
  type Phase,
  type RoundResult,
  type Slot,
} from '../shared/index.ts'
import { toRoomUnits, type UnitCode } from '../shared/units.ts'
import { DEFAULT_QUESTION_LIST } from './default-questions.ts'
import { validateGuess } from './validate.ts'

// ---------------------------------------------------------------- state

/** A question as the library stores it: answer in its stored unit. */
export interface StoredQuestion {
  /** Library row id; null for starter-list questions. */
  id: number | null
  category: string
  text: string
  answer: number
  unit: UnitCode | null
  fact: string | null
}

/** What prepareRound hands to init / next_round / new_game: a library question, or "use the starter list" with a notice for the host. */
export type PreparedQuestion = (StoredQuestion & { notice?: string }) | { builtin: true; notice: string }

/** The round's question in the room's units (answer rounded for play). */
export interface Question {
  id: number | null
  category: string
  text: string
  /** Secret until RESULTS. */
  answer: number
  /** Unit label in the room's system. */
  unit: string | null
  fact: string | null
}

export interface BallparkState {
  /** Snapshot at round start; settings only change in the lobby. */
  settings: BallparkSettings
  phase: Phase
  /** Round within this game, from 1 (resets on new_game). */
  round: number
  question: Question
  /** Players in this round, in join order. Late joiners wait for the next round. */
  roundPlayers: PlayerId[]
  /** Secret while GUESSING: each player sees only their own. */
  guesses: Record<PlayerId, number>
  /** Fixed when betting opens. */
  slots: Slot[]
  /** Secret while BETTING with hidden bets. */
  bets: Record<PlayerId, Bet[]>
  deadline: number | null
  scores: Scores
  result: RoundResult | null
  /** Starter questions used this game ("category|question", lower case). */
  usedBuiltin: string[]
  /** Library question ids used this game; prepareRound excludes them. */
  usedQuestionIds: number[]
}

/** Scheduled by the game itself and handled by onTimer; `round` and `phase` make a stale timer a no-op. */
export type BallparkTimer = { type: 'timeout'; round: number; phase: 'GUESSING' | 'BETTING' }

type Ctx = BaseCtx<BallparkSettings>
type Step = Transition<BallparkState, BallparkTimer>
type Fx = Effect<BallparkTimer>[]

const CANCEL_TIMER: Effect<BallparkTimer> = { type: 'cancel', key: 'timer' }

function startTimer(state: BallparkState, ctx: Ctx, phase: 'GUESSING' | 'BETTING'): { deadline: number | null; effects: Fx } {
  const seconds = state.settings.timerSeconds
  if (!seconds) return { deadline: null, effects: [CANCEL_TIMER] }
  const deadline = ctx.now + seconds * 1000
  return { deadline, effects: [CANCEL_TIMER, { type: 'schedule', key: 'timer', at: deadline, action: { type: 'timeout', round: state.round, phase } }] }
}

// ---------------------------------------------------------------- slots and scoring

/**
 * Odds by distance from the middle of `n` slots: the middle pays 2, each step out 1 more,
 * up to 5. With an even `n` the two central slots pay 3.
 */
export function oddsAt(index: number, n: number): number {
  const steps = n % 2 === 1 ? Math.abs(index - (n - 1) / 2) : index < n / 2 ? n / 2 - 1 - index : index - n / 2
  return Math.min(5, (n % 2 === 1 ? 2 : 3) + steps)
}

/** Distinct guesses, lowest first, with who made them; All too high first under the `over` rule. */
export function buildSlots(guesses: Record<PlayerId, number>, roundPlayers: readonly PlayerId[], settings: BallparkSettings): Slot[] {
  const values = [...new Set(roundPlayers.filter((id) => id in guesses).map((id) => guesses[id]!))].sort((a, b) => a - b)
  const flat = settings.scoring === 'flat'
  const slots: Slot[] = values.map((value, i) => ({
    id: `g${i}`,
    value,
    playerIds: roundPlayers.filter((id) => guesses[id] === value),
    odds: flat ? 1 : oddsAt(i, values.length),
  }))
  if (settings.winRule === 'over') slots.unshift({ id: TOO_HIGH, value: null, playerIds: [], odds: flat ? 1 : TOO_HIGH_ODDS })
  return slots
}

/** The winning slot ids for an answer (in the same units as the slots). */
export function winningSlots(slots: readonly Slot[], answer: number, winRule: BallparkSettings['winRule']): string[] {
  const guesses = slots.filter((s) => s.value !== null)
  if (guesses.length === 0) return []
  if (winRule === 'over') {
    const under = guesses.filter((s) => s.value! <= answer)
    return under.length === 0 ? [TOO_HIGH] : [under[under.length - 1]!.id]
  }
  const distance = (s: Slot) => Math.abs(s.value! - answer)
  const best = Math.min(...guesses.map(distance))
  // equal distances above and below can differ in the last float bit
  const eps = 1e-9 * Math.max(1, Math.abs(answer))
  return guesses.filter((s) => distance(s) - best <= eps).map((s) => s.id)
}

/** Points per round player: winning tokens (odds × (1 + stake)), lost stakes, and the guess bonus. */
export function scoreBets(state: BallparkState, winningIds: readonly string[]): Scores {
  const winning = state.slots.filter((s) => winningIds.includes(s.id))
  const bonus = state.settings.scoring === 'flat' ? 1 : GUESS_BONUS
  const points: Scores = {}
  for (const id of state.roundPlayers) {
    let total = 0
    for (const bet of state.bets[id] ?? []) {
      const slot = winning.find((s) => s.id === bet.slot)
      total += slot ? slot.odds * (1 + bet.stake) : -bet.stake
    }
    if (winning.some((s) => s.playerIds.includes(id))) total += bonus
    points[id] = total
  }
  return points
}

// ---------------------------------------------------------------- transitions

const builtinKey = (q: { category: string; question: string }) => `${q.category}|${q.question}`.toLowerCase()

function chooseQuestion(
  ctx: Ctx,
  prepared: PreparedQuestion | undefined,
  usedBuiltin: string[],
  usedQuestionIds: number[],
): { stored: StoredQuestion; usedBuiltin: string[]; usedQuestionIds: number[]; notice?: string } {
  if (prepared && !('builtin' in prepared)) {
    const { notice, ...stored } = prepared
    return {
      stored,
      usedBuiltin,
      usedQuestionIds: stored.id === null ? usedQuestionIds : [...usedQuestionIds, stored.id],
      ...(notice ? { notice } : {}),
    }
  }
  const notice = prepared?.notice
  const wanted = ctx.settings.category?.toLowerCase()
  const inCategory = DEFAULT_QUESTION_LIST.filter((q) => !wanted || q.category.toLowerCase() === wanted)
  const pool = inCategory.length > 0 ? inCategory : DEFAULT_QUESTION_LIST
  const fresh = pool.filter((q) => !usedBuiltin.includes(builtinKey(q)))
  const picked = ctx.rng.pick(fresh.length > 0 ? fresh : pool)
  return {
    stored: { id: null, category: picked.category, text: picked.question, answer: picked.answer, unit: picked.unit, fact: picked.fact },
    usedBuiltin: [...usedBuiltin, builtinKey(picked)],
    usedQuestionIds,
    ...(notice ? { notice } : {}),
  }
}

/** A new round. `fresh` (new_game): scores and the round count start over. */
function startRound(prev: BallparkState | null, ctx: Ctx, prepared: PreparedQuestion | undefined, fresh = false): Step {
  const ids = ctx.players.map((p) => p.id)
  const chosen = chooseQuestion(ctx, prepared, prev?.usedBuiltin ?? [], prev?.usedQuestionIds ?? [])
  const { stored } = chosen
  const converted = toRoomUnits(stored.answer, stored.unit, ctx.settings.units)

  const state: BallparkState = {
    settings: ctx.settings,
    phase: 'GUESSING',
    round: fresh || !prev ? 1 : prev.round + 1,
    question: { id: stored.id, category: stored.category, text: stored.text, answer: converted.answer, unit: converted.unit, fact: stored.fact },
    roundPlayers: ids,
    guesses: {},
    slots: [],
    bets: {},
    deadline: null,
    scores: carryScores(fresh ? undefined : prev?.scores, ids),
    result: null,
    usedBuiltin: chosen.usedBuiltin,
    usedQuestionIds: chosen.usedQuestionIds,
  }
  const timer = startTimer(state, ctx, 'GUESSING')
  const effects: Fx = [...timer.effects]
  if (chosen.notice) effects.push({ type: 'notice', to: 'host', message: chosen.notice })
  return { state: { ...state, deadline: timer.deadline }, effects }
}

/** Moves on once every connected round player has guessed (or bet). */
function maybeAdvance(state: BallparkState, ctx: Ctx): Step {
  if (state.phase === 'RESULTS') return { state }
  const done = state.phase === 'GUESSING' ? state.guesses : state.bets
  const waitingOn = state.roundPlayers.filter((id) => isConnected(ctx, id))
  if (waitingOn.length > 0 && waitingOn.every((id) => id in done)) {
    return state.phase === 'GUESSING' ? openBetting(state, ctx) : finishRound(state)
  }
  return { state }
}

function openBetting(state: BallparkState, ctx: Ctx): Step {
  // Nothing to bet on: straight to the answer.
  if (Object.keys(state.guesses).length === 0) return finishRound(state)
  const next: BallparkState = { ...state, phase: 'BETTING', slots: buildSlots(state.guesses, state.roundPlayers, state.settings), bets: {} }
  const timer = startTimer(next, ctx, 'BETTING')
  return { state: { ...next, deadline: timer.deadline }, effects: timer.effects }
}

function finishRound(state: BallparkState): Step {
  const winningSlotIds = winningSlots(state.slots, state.question.answer, state.settings.winRule)
  const points = scoreBets(state, winningSlotIds)
  const scores = addPoints(state.scores, points)
  for (const id of Object.keys(scores)) scores[id] = Math.max(0, scores[id]!)

  const { rounds } = state.settings
  const over = rounds !== null && state.round >= rounds
  const top = Math.max(...Object.values(scores))
  const winnerIds = over ? Object.keys(scores).filter((id) => scores[id] === top) : []

  return {
    state: {
      ...state,
      phase: 'RESULTS',
      deadline: null,
      scores,
      result: { answer: state.question.answer, fact: state.question.fact, winningSlotIds, pointsAwarded: points, winnerIds },
    },
    effects: [CANCEL_TIMER],
  }
}

function checkBets(state: BallparkState, actor: PlayerId, bets: readonly Bet[]): string | null {
  if (!bets.every((b) => state.slots.some((s) => s.id === b.slot))) return 'That guess is not on the board'
  const staked = bets.reduce((n, b) => n + b.stake, 0)
  if (state.settings.scoring !== 'chips') return staked > 0 ? 'Stakes are only used with chips scoring' : null
  const chips = state.scores[actor] ?? 0
  return staked > chips ? `You only have ${chips} chip${chips === 1 ? '' : 's'} to stake` : null
}

// ---------------------------------------------------------------- reducer

function reduce(state: BallparkState, action: ClientAction, ctx: ReduceCtx<BallparkSettings, PreparedQuestion>): Step | GameError {
  const actor = ctx.actorId
  const isHost = actor === ctx.hostId

  switch (action.type) {
    case 'submit_guess': {
      if (state.phase !== 'GUESSING') return gameError('Guesses are closed')
      if (!state.roundPlayers.includes(actor)) return gameError('You are not in this round')
      const checked = validateGuess(action.value)
      if (!checked.ok) return gameError(checked.error)
      return maybeAdvance({ ...state, guesses: { ...state.guesses, [actor]: checked.value } }, ctx)
    }

    case 'reveal_guesses':
      if (!isHost) return gameError('Only the host can reveal the guesses')
      if (state.phase !== 'GUESSING') return gameError('The guesses are already revealed')
      return openBetting(state, ctx)

    case 'place_bets': {
      if (state.phase !== 'BETTING') return gameError('Betting is closed')
      if (!state.roundPlayers.includes(actor)) return gameError('You are not in this round')
      const error = checkBets(state, actor, action.bets)
      if (error) return gameError(error)
      const bets = action.bets.map((b) => ({ slot: b.slot, stake: b.stake }))
      return maybeAdvance({ ...state, bets: { ...state.bets, [actor]: bets } }, ctx)
    }

    case 'reveal_answer':
      if (!isHost) return gameError('Only the host can reveal the answer')
      if (state.phase !== 'BETTING') return gameError('It is not time to reveal the answer')
      return finishRound(state)

    case 'next_round':
      if (!isHost) return gameError('Only the host can start the next round')
      if (state.phase !== 'RESULTS') return gameError('The round is not over yet')
      if (state.result?.winnerIds.length) return gameError('The game is over: start a new game')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startRound(state, ctx, ctx.prepared)

    case 'new_game':
      if (!isHost) return gameError('Only the host can start a new game')
      if (state.phase !== 'RESULTS' || !state.result?.winnerIds.length) return gameError('The game is not over yet')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startRound(state, ctx, ctx.prepared, true)
  }
}

/** A stale timer (earlier round or phase) is a no-op. */
function onTimer(state: BallparkState, action: BallparkTimer, ctx: TimerCtx<BallparkSettings, PreparedQuestion>): Step {
  if (action.round !== state.round || action.phase !== state.phase) return { state }
  return state.phase === 'GUESSING' ? openBetting(state, ctx) : finishRound(state)
}

// ---------------------------------------------------------------- view

function view(state: BallparkState, viewerId: PlayerId): BallparkView {
  const { phase } = state
  const betsShown = phase === 'RESULTS' || (phase === 'BETTING' && state.settings.bets === 'public')
  return {
    phase,
    round: state.round,
    totalRounds: state.settings.rounds,
    question: { text: state.question.text, category: state.question.category, unit: state.question.unit },
    you: {
      status: state.roundPlayers.includes(viewerId) ? 'playing' : 'waiting',
      guess: state.guesses[viewerId] ?? null,
      bets: state.bets[viewerId] ?? [],
    },
    roundPlayers: state.roundPlayers,
    guessed: state.roundPlayers.filter((id) => id in state.guesses),
    betted: state.roundPlayers.filter((id) => id in state.bets),
    deadline: phase === 'RESULTS' ? null : state.deadline,
    slots: phase === 'GUESSING' ? [] : state.slots,
    bets: betsShown ? state.bets : null,
    scores: state.scores,
    result: phase === 'RESULTS' ? state.result : null,
  }
}

// ---------------------------------------------------------------- module

export const ballpark = defineGame<BallparkState, ClientAction, BallparkTimer, BallparkView, BallparkSettings, PreparedQuestion>({
  ...meta,
  settingsSchema,
  defaultSettings,
  actionSchema: clientActionSchema,

  init: (ctx) => startRound(null, ctx, ctx.prepared),
  reduce,
  onTimer,
  view,

  onPlayerDisconnected: (state, _playerId, ctx) => maybeAdvance(state, ctx),

  onPlayerRemoved(state, playerId, ctx) {
    const next: BallparkState = { ...state, scores: withoutPlayer(state.scores, playerId) }
    // RESULTS keeps the round as scored. While betting, their slot stays on the board
    // (others may have bet on it); their own bets leave with them.
    if (!state.roundPlayers.includes(playerId) || state.phase === 'RESULTS') return { state: next }
    return maybeAdvance(
      {
        ...next,
        roundPlayers: state.roundPlayers.filter((id) => id !== playerId),
        guesses: state.phase === 'GUESSING' ? withoutPlayer(state.guesses, playerId) : state.guesses,
        bets: withoutPlayer(state.bets, playerId),
      },
      ctx,
    )
  },

  secrets: [
    {
      // While guessing, a viewer's view must not change when someone else's guess does,
      // including to the viewer's own guess.
      name: 'guesses',
      visibleTo: (s) => s.phase !== 'GUESSING',
      variants: (s, viewerId) => {
        const mine = s.guesses[viewerId]
        return Object.keys(s.guesses)
          .filter((id) => id !== viewerId)
          .flatMap((id) =>
            [987_654, ...(mine !== undefined ? [mine] : [])]
              .filter((value) => value !== s.guesses[id])
              .map((value) => ({ ...s, guesses: { ...s.guesses, [id]: value } })),
          )
      },
    },
    {
      name: 'answer',
      visibleTo: (s) => s.phase === 'RESULTS',
      variants: (s) => [{ ...s, question: { ...s.question, answer: s.question.answer + 1, fact: 'Zz variant fact' } }],
    },
    {
      // With hidden bets, nobody sees where anyone else's tokens are until the answer.
      name: 'bets',
      visibleTo: (s) => s.phase !== 'BETTING' || s.settings.bets === 'public',
      variants: (s, viewerId) => {
        const first = s.slots[0]?.id
        const last = s.slots[s.slots.length - 1]?.id
        if (!first || !last) return []
        return Object.keys(s.bets)
          .filter((id) => id !== viewerId)
          .flatMap((id) => {
            const current = JSON.stringify(s.bets[id])
            return [first, last]
              .map((slot) => [{ slot, stake: 0 }, { slot, stake: 0 }])
              .filter((bets) => JSON.stringify(bets) !== current)
              .map((bets) => ({ ...s, bets: { ...s.bets, [id]: bets } }))
          })
      },
    },
  ],
})
