/**
 * Word Imposter: pure init / reduce / view, plus the secrets spec checked by
 * the core leak test. No I/O here; the word arrives through ctx.prepared
 * (from prepareRound) or is picked from the built-in list with ctx.rng.
 *
 * CLUES -> VOTING -> REVEAL -> (GUESS_CHECK) -> RESULTS -> next_round -> CLUES
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
import type { ZodType } from 'zod'
import {
  clientActionSchema,
  defaultSettings,
  DISCONNECT_GRACE_MS,
  GAME_ID,
  MAX_PLAYERS,
  MIN_PLAYERS,
  REVEAL_MS,
  settingsSchema,
  type ClientAction,
  type Clue,
  type ImposterSettings,
  type ImposterView,
  type Phase,
  type ResultView,
} from '../shared/index.ts'
import { BUILTIN_WORDS } from './builtin-words.ts'
import { isSameWord, validateClueFormat } from './validate.ts'

// ---------------------------------------------------------------- state

export interface SecretWord {
  /** Library row id; null for built-in words. */
  id: number | null
  category: string
  word: string
  hint: string
}

/** What prepareRound hands to init / next_round: a library word, or "use built-in words" with a notice for the host. */
export type PreparedWord = (SecretWord & { notice?: string }) | { builtin: true; notice: string }

interface Outcome {
  votes: Record<PlayerId, number>
  accusedId: PlayerId | null
  caught: boolean
  judgeId: PlayerId | null
  guessRequired: boolean
  guessCorrect: boolean | null
  imposterWon: boolean | null
  pointsAwarded: Record<PlayerId, number> | null
  voided: boolean
}

export interface ImposterState {
  /** Snapshot at round start; settings only change in the lobby. */
  settings: ImposterSettings
  phase: Phase
  round: number
  secret: SecretWord
  imposterId: PlayerId
  /** Players in this round, in join order. Late joiners wait for the next round. */
  roundPlayers: PlayerId[]
  turnOrder: PlayerId[]
  /** Index into turnOrder x rotations; >= total means clues are done. */
  turnIndex: number
  turnDeadline: number | null
  clues: Clue[]
  /** voter -> target. Secret: only tallies are ever shown. */
  ballots: Record<PlayerId, PlayerId>
  outcome: Outcome | null
  scores: Record<PlayerId, number>
  /** Built-in words used this game ("category|word", lower case). */
  usedBuiltin: string[]
  /** Library word ids used this game; prepareRound excludes them. */
  usedWordIds: number[]
}

/** Dispatched by scheduled effects only (actorId null). round/turnIndex make stale timers no-ops. */
export type SystemAction =
  | { type: 'turn_timeout'; round: number; turnIndex: number }
  | { type: 'turn_skip'; round: number; turnIndex: number }
  | { type: 'reveal_done'; round: number }
  | { type: 'guess_timeout'; round: number }

export type ImposterAction = ClientAction | SystemAction

type Ctx = BaseCtx<ImposterSettings>
type Step = Transition<ImposterState, ImposterAction>
type Fx = Effect<ImposterAction>[]

const TIMER_KEYS = ['turn_timer', 'turn_skip', 'reveal', 'guess_timeout'] as const
const REVEALED: readonly Phase[] = ['REVEAL', 'GUESS_CHECK', 'RESULTS']

// ---------------------------------------------------------------- helpers

const isPresent = (ctx: Ctx, id: PlayerId) => ctx.players.some((p) => p.id === id)
const isConnected = (ctx: Ctx, id: PlayerId) => ctx.players.find((p) => p.id === id)?.connected ?? false
const cancel = (key: (typeof TIMER_KEYS)[number]): Effect<ImposterAction> => ({ type: 'cancel', key })

function totalTurns(state: ImposterState): number {
  return state.turnOrder.length * state.settings.rotations
}

function currentPlayer(state: ImposterState): PlayerId | null {
  if (state.phase !== 'CLUES' || state.turnIndex >= totalTurns(state)) return null
  return state.turnOrder[state.turnIndex % state.turnOrder.length] ?? null
}

function currentRotation(state: ImposterState): number {
  if (state.turnOrder.length === 0) return 1
  return Math.min(Math.floor(state.turnIndex / state.turnOrder.length) + 1, state.settings.rotations)
}

const builtinKey = (w: { category: string; word: string }) => `${w.category}|${w.word}`.toLowerCase()

function chooseWord(
  ctx: Ctx,
  prepared: PreparedWord | undefined,
  usedBuiltin: string[],
  usedWordIds: number[],
): { secret: SecretWord; usedBuiltin: string[]; usedWordIds: number[]; notice?: string } {
  if (prepared && !('builtin' in prepared)) {
    const { notice, ...secret } = prepared
    return {
      secret,
      usedBuiltin: secret.id === null ? [...usedBuiltin, builtinKey(secret)] : usedBuiltin,
      usedWordIds: secret.id === null ? usedWordIds : [...usedWordIds, secret.id],
      ...(notice ? { notice } : {}),
    }
  }
  const notice = prepared?.notice
  const wanted = ctx.settings.category?.toLowerCase()
  const inCategory = BUILTIN_WORDS.filter((w) => !wanted || w.category.toLowerCase() === wanted)
  const pool = inCategory.length > 0 ? inCategory : BUILTIN_WORDS
  const fresh = pool.filter((w) => !usedBuiltin.includes(builtinKey(w)))
  const word = ctx.rng.pick(fresh.length > 0 ? fresh : pool)
  return {
    secret: { id: null, ...word },
    usedBuiltin: [...usedBuiltin, builtinKey(word)],
    usedWordIds,
    ...(notice ? { notice } : {}),
  }
}

function pickJudge(state: ImposterState, ctx: Ctx): PlayerId | null {
  const crew = ctx.players.filter(
    (p) => p.connected && p.id !== state.imposterId && state.roundPlayers.includes(p.id),
  )
  return (crew.find((p) => p.id === ctx.hostId) ?? crew[0])?.id ?? null
}

// ---------------------------------------------------------------- transitions

function startRound(prev: ImposterState | null, ctx: Ctx, prepared: PreparedWord | undefined): Step {
  const ids = ctx.players.map((p) => p.id)
  const word = chooseWord(ctx, prepared, prev?.usedBuiltin ?? [], prev?.usedWordIds ?? [])
  const scores: Record<PlayerId, number> = {}
  for (const id of ids) scores[id] = prev?.scores[id] ?? 0

  const state: ImposterState = {
    settings: ctx.settings,
    phase: 'CLUES',
    round: (prev?.round ?? 0) + 1,
    secret: word.secret,
    imposterId: ctx.rng.pick(ids),
    roundPlayers: ids,
    turnOrder: ctx.rng.shuffle(ids),
    turnIndex: 0,
    turnDeadline: null,
    clues: [],
    ballots: {},
    outcome: null,
    scores,
    usedBuiltin: word.usedBuiltin,
    usedWordIds: word.usedWordIds,
  }
  const effects: Fx = TIMER_KEYS.map(cancel)
  if (word.notice) effects.push({ type: 'notice', to: 'host', message: word.notice })
  return enterTurn(state, ctx, effects)
}

/** Start the turn at state.turnIndex, skipping players who have left. */
function enterTurn(state: ImposterState, ctx: Ctx, effects: Fx = []): Step {
  const total = totalTurns(state)
  let index = state.turnIndex
  while (index < total && !isPresent(ctx, state.turnOrder[index % state.turnOrder.length]!)) index++
  if (index >= total) return enterVoting({ ...state, turnIndex: index }, ctx, effects)

  const playerId = state.turnOrder[index % state.turnOrder.length]!
  const { clueTimerSeconds, clueMode } = state.settings
  const deadline = clueTimerSeconds ? ctx.now + clueTimerSeconds * 1000 : null
  effects.push(cancel('turn_timer'), cancel('turn_skip'))
  if (deadline !== null && clueMode === 'typed') {
    effects.push({
      type: 'schedule',
      key: 'turn_timer',
      at: deadline,
      action: { type: 'turn_timeout', round: state.round, turnIndex: index },
    })
  }
  if (!isConnected(ctx, playerId)) effects.push(scheduleTurnSkip(state, ctx, index))
  return { state: { ...state, phase: 'CLUES', turnIndex: index, turnDeadline: deadline }, effects }
}

function scheduleTurnSkip(state: ImposterState, ctx: Ctx, turnIndex: number): Effect<ImposterAction> {
  return {
    type: 'schedule',
    key: 'turn_skip',
    at: ctx.now + DISCONNECT_GRACE_MS,
    action: { type: 'turn_skip', round: state.round, turnIndex },
  }
}

function advanceTurn(state: ImposterState, ctx: Ctx, effects: Fx = []): Step {
  return enterTurn({ ...state, turnIndex: state.turnIndex + 1 }, ctx, effects)
}

function enterVoting(state: ImposterState, ctx: Ctx, effects: Fx = []): Step {
  effects.push(cancel('turn_timer'), cancel('turn_skip'))
  return maybeFinishVoting({ ...state, phase: 'VOTING', turnDeadline: null }, ctx, effects)
}

/** Voting ends once every connected round player has voted. */
function maybeFinishVoting(state: ImposterState, ctx: Ctx, effects: Fx = []): Step {
  if (state.phase !== 'VOTING') return { state, effects }
  const voters = state.roundPlayers.filter((id) => isConnected(ctx, id))
  if (voters.length > 0 && voters.every((id) => id in state.ballots)) return enterReveal(state, ctx, effects)
  return { state, effects }
}

function enterReveal(state: ImposterState, ctx: Ctx, effects: Fx = []): Step {
  const votes: Record<PlayerId, number> = {}
  for (const [voter, target] of Object.entries(state.ballots)) {
    if (state.roundPlayers.includes(voter) && state.roundPlayers.includes(target)) votes[target] = (votes[target] ?? 0) + 1
  }
  const top = Math.max(0, ...Object.values(votes))
  const leaders = Object.keys(votes).filter((id) => votes[id] === top)
  const accusedId = top > 0 && leaders.length === 1 ? leaders[0]! : null
  const caught = accusedId === state.imposterId
  const { guessMode } = state.settings
  const outcome: Outcome = {
    votes,
    accusedId,
    caught,
    judgeId: null,
    guessRequired: guessMode === 'bonus' || (guessMode === 'steal' && caught),
    guessCorrect: null,
    imposterWon: null,
    pointsAwarded: null,
    voided: false,
  }
  effects.push({ type: 'schedule', key: 'reveal', at: ctx.now + REVEAL_MS, action: { type: 'reveal_done', round: state.round } })
  return { state: { ...state, phase: 'REVEAL', outcome }, effects }
}

function revealDone(state: ImposterState, ctx: Ctx): Step {
  const outcome = state.outcome!
  if (!outcome.guessRequired) return finishRound(state, null)
  if (!state.roundPlayers.includes(state.imposterId)) return finishRound(state, false)
  const next: ImposterState = { ...state, phase: 'GUESS_CHECK', outcome: { ...outcome, judgeId: pickJudge(state, ctx) } }
  const effects: Fx = isConnected(ctx, state.imposterId) ? [] : [scheduleGuessTimeout(state, ctx)]
  return { state: next, effects }
}

function scheduleGuessTimeout(state: ImposterState, ctx: Ctx): Effect<ImposterAction> {
  return {
    type: 'schedule',
    key: 'guess_timeout',
    at: ctx.now + DISCONNECT_GRACE_MS,
    action: { type: 'guess_timeout', round: state.round },
  }
}

function finishRound(state: ImposterState, guessCorrect: boolean | null): Step {
  const outcome = state.outcome!
  const { guessMode, catchPoints, escapePoints, guessPoints } = state.settings
  const imposterInRound = state.roundPlayers.includes(state.imposterId)
  const points: Record<PlayerId, number> = {}
  for (const id of state.roundPlayers) points[id] = 0

  let imposterWon = !outcome.caught
  if (guessMode === 'steal' && outcome.caught && guessCorrect === true) imposterWon = true

  if (imposterWon) {
    if (imposterInRound) points[state.imposterId]! += escapePoints
  } else {
    for (const id of state.roundPlayers) if (id !== state.imposterId) points[id]! += catchPoints
  }
  if (guessMode === 'bonus' && guessCorrect === true && imposterInRound) points[state.imposterId]! += guessPoints

  const scores = { ...state.scores }
  for (const [id, n] of Object.entries(points)) scores[id] = (scores[id] ?? 0) + n

  return {
    state: {
      ...state,
      phase: 'RESULTS',
      scores,
      outcome: { ...outcome, guessCorrect, imposterWon, pointsAwarded: points },
    },
    effects: [cancel('reveal'), cancel('guess_timeout')],
  }
}

function voidRound(state: ImposterState): Step {
  return {
    state: {
      ...state,
      phase: 'RESULTS',
      turnDeadline: null,
      outcome: {
        votes: {},
        accusedId: null,
        caught: false,
        judgeId: null,
        guessRequired: false,
        guessCorrect: null,
        imposterWon: null,
        pointsAwarded: {},
        voided: true,
      },
    },
    effects: [
      ...TIMER_KEYS.map(cancel),
      { type: 'notice', to: 'all', message: "The imposter left, so this round doesn't count." },
    ],
  }
}

// ---------------------------------------------------------------- reducer

function reduce(state: ImposterState, action: ImposterAction, ctx: ReduceCtx<ImposterSettings, PreparedWord>): Step | GameError {
  const actor = ctx.actorId
  const isHost = actor !== null && actor === ctx.hostId

  switch (action.type) {
    case 'submit_clue': {
      if (state.phase !== 'CLUES') return gameError('It is not the clue phase')
      if (state.settings.clueMode !== 'typed') return gameError('Clues are spoken out loud in this game')
      if (actor === null || actor !== currentPlayer(state)) return gameError("It's not your turn")
      const format = validateClueFormat(action.word)
      if (!format.ok) return gameError(format.error)
      const word = format.value
      // Crew may not give the word away. The imposter's clue is never checked
      // against the word: rejecting it would let them probe for the word.
      if (actor !== state.imposterId && isSameWord(word, state.secret.word)) {
        return gameError("You can't use the secret word")
      }
      if (state.clues.some((c) => isSameWord(c.word, word))) return gameError('That clue was already given')
      const clue: Clue = { playerId: actor, word, rotation: currentRotation(state) }
      return advanceTurn({ ...state, clues: [...state.clues, clue] }, ctx)
    }

    case 'end_turn': {
      if (state.phase !== 'CLUES') return gameError('It is not the clue phase')
      if (state.settings.clueMode !== 'spoken') return gameError('Type your clue instead')
      if (actor === null || (actor !== currentPlayer(state) && !isHost)) return gameError("It's not your turn")
      return advanceTurn(state, ctx)
    }

    case 'start_voting':
      if (!isHost) return gameError('Only the host can start voting')
      if (state.phase !== 'CLUES') return gameError('Voting has already started')
      return enterVoting(state, ctx)

    case 'cast_vote': {
      if (state.phase !== 'VOTING') return gameError('It is not time to vote')
      if (actor === null || !state.roundPlayers.includes(actor)) return gameError('You are not in this round')
      if (action.targetId === actor) return gameError("You can't vote for yourself")
      if (!state.roundPlayers.includes(action.targetId)) return gameError('That player is not in this round')
      return maybeFinishVoting({ ...state, ballots: { ...state.ballots, [actor]: action.targetId } }, ctx)
    }

    case 'end_voting':
      if (!isHost) return gameError('Only the host can end voting')
      if (state.phase !== 'VOTING') return gameError('It is not time to vote')
      return enterReveal(state, ctx)

    case 'judge_guess':
      if (state.phase !== 'GUESS_CHECK') return gameError('There is no guess to judge')
      if (actor === null || actor !== state.outcome?.judgeId) return gameError('Only the judge can decide')
      return finishRound(state, action.correct)

    case 'skip_guess':
      if (!isHost) return gameError('Only the host can skip the guess')
      if (state.phase !== 'GUESS_CHECK') return gameError('There is no guess to skip')
      return finishRound(state, false)

    case 'next_round':
      if (!isHost) return gameError('Only the host can start the next round')
      if (state.phase !== 'RESULTS') return gameError('The round is not over yet')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startRound(state, ctx, ctx.prepared)

    // ---- scheduled (actorId null only); stale timers are no-ops
    case 'turn_timeout':
    case 'turn_skip':
    case 'reveal_done':
    case 'guess_timeout': {
      if (actor !== null) return gameError('Not allowed')
      if (action.round !== state.round) return { state }
      if (action.type === 'turn_timeout' || action.type === 'turn_skip') {
        if (state.phase !== 'CLUES' || action.turnIndex !== state.turnIndex) return { state }
        if (action.type === 'turn_timeout' && state.settings.clueMode !== 'typed') return { state }
        const current = currentPlayer(state)
        if (action.type === 'turn_skip' && current !== null && isConnected(ctx, current)) return { state }
        return advanceTurn(state, ctx)
      }
      if (action.type === 'reveal_done') return state.phase === 'REVEAL' ? revealDone(state, ctx) : { state }
      if (state.phase !== 'GUESS_CHECK' || isConnected(ctx, state.imposterId)) return { state }
      return finishRound(state, false)
    }
  }
}

// ---------------------------------------------------------------- view

function view(state: ImposterState, viewerId: PlayerId): ImposterView {
  const inRound = state.roundPlayers.includes(viewerId)
  const isImposter = viewerId === state.imposterId
  const { imposterHint, clueMode, rotations } = state.settings
  const seesWord = inRound && !isImposter

  const you: ImposterView['you'] = {
    role: !inRound ? 'waiting' : isImposter ? 'imposter' : 'crew',
    word: seesWord ? state.secret.word : null,
    category: seesWord || (isImposter && imposterHint !== 'none') ? state.secret.category : null,
    hint: isImposter && imposterHint === 'category+hint' ? state.secret.hint : null,
    vote: state.phase === 'VOTING' ? (state.ballots[viewerId] ?? null) : null,
  }

  let result: ResultView | undefined
  if (REVEALED.includes(state.phase) && state.outcome) {
    const o = state.outcome
    const done = state.phase === 'RESULTS'
    result = {
      votes: o.votes,
      accusedId: o.accusedId,
      caught: o.caught,
      imposterId: state.imposterId,
      judgeId: o.judgeId,
      guessRequired: o.guessRequired,
      guessCorrect: o.guessCorrect,
      ...(seesWord || done ? { secretWord: state.secret.word } : {}),
      ...(done ? { imposterWon: o.imposterWon ?? false, pointsAwarded: o.pointsAwarded ?? {} } : {}),
      ...(o.voided ? { voided: true } : {}),
    }
  }

  return {
    phase: state.phase,
    round: state.round,
    you,
    roundPlayers: state.roundPlayers,
    scores: state.scores,
    turn: {
      order: state.turnOrder.filter((id) => state.roundPlayers.includes(id)),
      currentPlayerId: currentPlayer(state),
      rotation: currentRotation(state),
      totalRotations: rotations,
      deadline: state.phase === 'CLUES' ? state.turnDeadline : null,
    },
    clues: clueMode === 'typed' ? state.clues : [],
    voted: Object.keys(state.ballots).filter((id) => state.roundPlayers.includes(id)),
    ...(result ? { result } : {}),
  }
}

// ---------------------------------------------------------------- module

export const imposter = defineGame<ImposterState, ImposterAction, ImposterView, ImposterSettings, PreparedWord>({
  id: GAME_ID,
  name: 'Word Imposter',
  description: 'Everyone gets the secret word except the imposter. Give clues, find the faker.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  settingsSchema,
  defaultSettings,
  // Clients can only send ClientActions; SystemActions come from scheduled effects.
  actionSchema: clientActionSchema as ZodType<ImposterAction>,

  init: (ctx) => startRound(null, ctx, ctx.prepared),
  reduce,
  view,

  onPlayerDisconnected(state, playerId, ctx) {
    switch (state.phase) {
      case 'CLUES':
        if (currentPlayer(state) === playerId) return { state, effects: [scheduleTurnSkip(state, ctx, state.turnIndex)] }
        return { state }
      case 'VOTING':
        return maybeFinishVoting(state, ctx)
      case 'GUESS_CHECK': {
        const effects: Fx = playerId === state.imposterId ? [scheduleGuessTimeout(state, ctx)] : []
        if (playerId !== state.outcome?.judgeId) return { state, effects }
        return { state: { ...state, outcome: { ...state.outcome, judgeId: pickJudge(state, ctx) } }, effects }
      }
      default:
        return { state }
    }
  },

  onPlayerReconnected(state, playerId, ctx) {
    if (state.phase === 'CLUES' && currentPlayer(state) === playerId) {
      return { state, effects: [cancel('turn_skip')] }
    }
    if (state.phase === 'GUESS_CHECK' && state.outcome) {
      const effects: Fx = playerId === state.imposterId ? [cancel('guess_timeout')] : []
      if (state.outcome.judgeId !== null) return { state, effects }
      return { state: { ...state, outcome: { ...state.outcome, judgeId: pickJudge(state, ctx) } }, effects }
    }
    return { state }
  },

  onPlayerRemoved(state, playerId, ctx) {
    const scores = { ...state.scores }
    delete scores[playerId]
    if (!state.roundPlayers.includes(playerId)) return { state: { ...state, scores } }

    const ballots: Record<PlayerId, PlayerId> = {}
    for (const [voter, target] of Object.entries(state.ballots)) {
      if (voter !== playerId && target !== playerId) ballots[voter] = target
    }
    const wasCurrent = currentPlayer(state) === playerId
    const next: ImposterState = {
      ...state,
      scores,
      ballots,
      roundPlayers: state.roundPlayers.filter((id) => id !== playerId),
    }

    if (playerId === state.imposterId) {
      if (state.phase === 'CLUES' || state.phase === 'VOTING') return voidRound(next)
      if (state.phase === 'GUESS_CHECK') return finishRound(next, false)
      return { state: next } // REVEAL: revealDone counts the guess as missed
    }
    switch (state.phase) {
      case 'CLUES':
        return wasCurrent ? enterTurn(next, ctx) : { state: next }
      case 'VOTING':
        return maybeFinishVoting(next, ctx)
      case 'GUESS_CHECK':
        if (state.outcome?.judgeId !== playerId) return { state: next }
        return { state: { ...next, outcome: { ...next.outcome!, judgeId: pickJudge(next, ctx) } } }
      default:
        return { state: next }
    }
  },

  secrets: [
    {
      name: 'secretWord',
      visibleTo: (s, viewerId) =>
        s.phase === 'RESULTS' || (viewerId !== s.imposterId && s.roundPlayers.includes(viewerId)),
      // If the imposter typed the exact word as a clue, they already have the string
      // (without knowing it is the word); the variant check still covers them.
      values: (s) =>
        s.clues.some((c) => c.playerId === s.imposterId && isSameWord(c.word, s.secret.word)) ? [] : [s.secret.word],
      variants: (s) => [{ ...s, secret: { ...s.secret, word: 'Zz Variant Word' } }],
    },
    {
      name: 'imposterId',
      visibleTo: (s, viewerId) => viewerId === s.imposterId || REVEALED.includes(s.phase),
      variants: (s) => s.roundPlayers.filter((id) => id !== s.imposterId).map((imposterId) => ({ ...s, imposterId })),
    },
    {
      name: 'ballots',
      visibleTo: (s) => s.phase !== 'VOTING',
      variants: (s, viewerId) =>
        Object.keys(s.ballots)
          .filter((voter) => voter !== viewerId)
          .flatMap((voter) => {
            const alt = s.roundPlayers.find((id) => id !== voter && id !== s.ballots[voter])
            return alt ? [{ ...s, ballots: { ...s.ballots, [voter]: alt } }] : []
          }),
    },
  ],
})
