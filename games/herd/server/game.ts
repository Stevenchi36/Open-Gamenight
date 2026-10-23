/**
 * Flock: pure init / reduce / onTimer / view, plus the secrets spec checked
 * by the core leak test. No I/O here; the question arrives through ctx.prepared
 * (from prepareRound) or is picked from the starter list with ctx.rng.
 *
 * ANSWERING -> (REVIEW) -> RESULTS -> next_round -> ANSWERING
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
import { addPoints, carryScores, isConnected, withoutPlayer, type Scores } from '@wsfg/core/kit'
import {
  clientActionSchema,
  defaultSettings,
  meta,
  MIN_PLAYERS,
  settingsSchema,
  type AnswerGroup,
  type ClientAction,
  type HerdSettings,
  type HerdView,
  type Phase,
  type RoundResult,
} from '../shared/index.ts'
import { DEFAULT_QUESTION_LIST } from './default-questions.ts'
import { normalizeAnswer, validateAnswer } from './validate.ts'

// ---------------------------------------------------------------- state

export interface Question {
  /** Library row id; null for starter-list questions. */
  id: number | null
  category: string
  text: string
}

/** What prepareRound hands to init / next_round / new_game: a library question, or "use the starter list" with a notice for the host. */
export type PreparedQuestion = (Question & { notice?: string }) | { builtin: true; notice: string }

interface Answer {
  text: string
  /** normalizeAnswer(text): answers with the same key start in the same group. */
  key: string
}

export interface HerdState {
  /** Snapshot at round start; settings only change in the lobby. */
  settings: HerdSettings
  phase: Phase
  round: number
  question: Question
  /** Players in this round, in join order. Late joiners wait for the next round. */
  roundPlayers: PlayerId[]
  /** Secret while ANSWERING: each player sees only their own. */
  answers: Record<PlayerId, Answer>
  /** Answer key -> the group it was merged into (REVIEW). Keys not listed are their own group. */
  merged: Record<string, string>
  deadline: number | null
  scores: Scores
  blackSheepId: PlayerId | null
  result: RoundResult | null
  /** Starter questions used this game ("category|question", lower case). */
  usedBuiltin: string[]
  /** Library question ids used this game; prepareRound excludes them. */
  usedQuestionIds: number[]
}

/** Scheduled by the game itself and handled by onTimer; `round` makes a stale timer a no-op. */
export type HerdTimer = { type: 'answer_timeout'; round: number }

type Ctx = BaseCtx<HerdSettings>
type Step = Transition<HerdState, HerdTimer>
type Fx = Effect<HerdTimer>[]

const CANCEL_TIMER: Effect<HerdTimer> = { type: 'cancel', key: 'answer_timer' }

// ---------------------------------------------------------------- groups

function groupOf(state: HerdState, key: string): string {
  return state.merged[key] ?? key
}

/** Answers grouped by key (after the host's merges), biggest group first. */
export function buildGroups(state: HerdState): AnswerGroup[] {
  const groups: AnswerGroup[] = []
  for (const playerId of state.roundPlayers) {
    const answer = state.answers[playerId]
    if (!answer) continue
    const id = groupOf(state, answer.key)
    let group = groups.find((g) => g.id === id)
    if (!group) groups.push((group = { id, label: '', merged: false, answers: [] }))
    group.answers.push({ playerId, text: answer.text })
    if (answer.key !== id) group.merged = true
  }
  for (const group of groups) group.label = commonestSpelling(group.answers.map((a) => a.text))
  return groups.sort((a, b) => b.answers.length - a.answers.length || a.label.localeCompare(b.label))
}

/** The most frequent text (ignoring case), first given among ties. */
function commonestSpelling(texts: string[]): string {
  let best = texts[0] ?? ''
  let bestCount = 0
  for (const text of texts) {
    const count = texts.filter((t) => t.toLowerCase() === text.toLowerCase()).length
    if (count > bestCount) [best, bestCount] = [text, count]
  }
  return best
}

/** The strictly biggest group with 2+ answers; null on a tie or when every answer differs. */
export function flockOf(groups: readonly AnswerGroup[]): string | null {
  const [first, second] = groups
  if (!first || first.answers.length < 2) return null
  return (second?.answers.length ?? 0) < first.answers.length ? first.id : null
}

/** The odd one out: the only answer alone in its group, out of 3+ answers. */
function loneAnswerer(groups: readonly AnswerGroup[]): PlayerId | null {
  const total = groups.reduce((n, g) => n + g.answers.length, 0)
  const singles = groups.filter((g) => g.answers.length === 1)
  return total >= 3 && singles.length === 1 ? singles[0]!.answers[0]!.playerId : null
}

// ---------------------------------------------------------------- transitions

const builtinKey = (q: { category: string; question: string }) => `${q.category}|${q.question}`.toLowerCase()

function chooseQuestion(
  ctx: Ctx,
  prepared: PreparedQuestion | undefined,
  usedBuiltin: string[],
  usedQuestionIds: number[],
): { question: Question; usedBuiltin: string[]; usedQuestionIds: number[]; notice?: string } {
  if (prepared && !('builtin' in prepared)) {
    const { notice, ...question } = prepared
    return {
      question,
      usedBuiltin,
      usedQuestionIds: question.id === null ? usedQuestionIds : [...usedQuestionIds, question.id],
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
    question: { id: null, category: picked.category, text: picked.question },
    usedBuiltin: [...usedBuiltin, builtinKey(picked)],
    usedQuestionIds,
    ...(notice ? { notice } : {}),
  }
}

/** A new round. `fresh` (new_game): scores and the black sheep start over. */
function startRound(prev: HerdState | null, ctx: Ctx, prepared: PreparedQuestion | undefined, fresh = false): Step {
  const ids = ctx.players.map((p) => p.id)
  const chosen = chooseQuestion(ctx, prepared, prev?.usedBuiltin ?? [], prev?.usedQuestionIds ?? [])
  const { answerTimerSeconds } = ctx.settings
  const deadline = answerTimerSeconds ? ctx.now + answerTimerSeconds * 1000 : null
  const round = (prev?.round ?? 0) + 1
  const blackSheepId = !fresh && prev?.blackSheepId && ids.includes(prev.blackSheepId) ? prev.blackSheepId : null

  const state: HerdState = {
    settings: ctx.settings,
    phase: 'ANSWERING',
    round,
    question: chosen.question,
    roundPlayers: ids,
    answers: {},
    merged: {},
    deadline,
    scores: carryScores(fresh ? undefined : prev?.scores, ids),
    blackSheepId,
    result: null,
    usedBuiltin: chosen.usedBuiltin,
    usedQuestionIds: chosen.usedQuestionIds,
  }
  const effects: Fx = [CANCEL_TIMER]
  if (deadline !== null) effects.push({ type: 'schedule', key: 'answer_timer', at: deadline, action: { type: 'answer_timeout', round } })
  if (chosen.notice) effects.push({ type: 'notice', to: 'host', message: chosen.notice })
  return { state, effects }
}

/** Answers are revealed once every connected round player has answered. */
function maybeReveal(state: HerdState, ctx: Ctx): Step {
  if (state.phase !== 'ANSWERING') return { state }
  const waitingOn = state.roundPlayers.filter((id) => isConnected(ctx, id))
  if (waitingOn.length > 0 && waitingOn.every((id) => id in state.answers)) return reveal(state)
  return { state }
}

function reveal(state: HerdState): Step {
  const next: HerdState = { ...state, phase: 'REVIEW', deadline: null, merged: {} }
  if (state.settings.checkMatches) return { state: next, effects: [CANCEL_TIMER] }
  return scoreRound(next)
}

function scoreRound(state: HerdState): Step {
  const groups = buildGroups(state)
  const flockId = flockOf(groups)
  const points: Scores = {}
  for (const id of state.roundPlayers) points[id] = 0
  for (const { playerId } of groups.find((g) => g.id === flockId)?.answers ?? []) points[playerId] = 1
  const scores = addPoints(state.scores, points)

  const blackSheepFrom = state.blackSheepId
  const blackSheepTo = (state.settings.blackSheep ? loneAnswerer(groups) : null) ?? blackSheepFrom
  const limit = state.settings.scoreLimit
  const winnerIds = limit === null ? [] : Object.keys(scores).filter((id) => scores[id]! >= limit && id !== blackSheepTo)

  return {
    state: {
      ...state,
      phase: 'RESULTS',
      deadline: null,
      scores,
      blackSheepId: blackSheepTo,
      result: { pointsAwarded: points, blackSheepFrom, blackSheepTo, winnerIds },
    },
    effects: [CANCEL_TIMER],
  }
}

// ---------------------------------------------------------------- reducer

function reduce(state: HerdState, action: ClientAction, ctx: ReduceCtx<HerdSettings, PreparedQuestion>): Step | GameError {
  const actor = ctx.actorId
  const isHost = actor === ctx.hostId

  switch (action.type) {
    case 'submit_answer': {
      if (state.phase !== 'ANSWERING') return gameError('Answers are closed')
      if (!state.roundPlayers.includes(actor)) return gameError('You are not in this round')
      const checked = validateAnswer(action.text)
      if (!checked.ok) return gameError(checked.error)
      const answers = { ...state.answers, [actor]: { text: checked.value, key: normalizeAnswer(checked.value) } }
      return maybeReveal({ ...state, answers }, ctx)
    }

    case 'reveal_answers':
      if (!isHost) return gameError('Only the host can reveal the answers')
      if (state.phase !== 'ANSWERING') return gameError('The answers are already revealed')
      return reveal(state)

    case 'merge_groups': {
      if (!isHost) return gameError('Only the host can merge answers')
      if (state.phase !== 'REVIEW') return gameError('It is not time to check answers')
      const ids = buildGroups(state).map((g) => g.id)
      if (!ids.includes(action.from) || !ids.includes(action.into)) return gameError('That answer is not on the list')
      if (action.from === action.into) return gameError('Pick two different answers')
      const merged = { ...state.merged }
      const keys = new Set([...Object.values(state.answers).map((a) => a.key), ...Object.keys(merged)])
      for (const key of keys) if (groupOf(state, key) === action.from) merged[key] = action.into
      return { state: { ...state, merged } }
    }

    case 'split_group': {
      if (!isHost) return gameError('Only the host can split answers')
      if (state.phase !== 'REVIEW') return gameError('It is not time to check answers')
      if (!buildGroups(state).some((g) => g.id === action.group)) return gameError('That answer is not on the list')
      const merged = { ...state.merged }
      for (const key of Object.keys(merged)) if (merged[key] === action.group) delete merged[key]
      return { state: { ...state, merged } }
    }

    case 'score_round':
      if (!isHost) return gameError('Only the host can score the round')
      if (state.phase !== 'REVIEW') return gameError('It is not time to score')
      return scoreRound(state)

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

/** A stale timer (earlier round, or answers already revealed) is a no-op. */
function onTimer(state: HerdState, action: HerdTimer, _ctx: TimerCtx<HerdSettings, PreparedQuestion>): Step {
  if (action.round !== state.round || state.phase !== 'ANSWERING') return { state }
  return reveal(state)
}

// ---------------------------------------------------------------- view

function view(state: HerdState, viewerId: PlayerId): HerdView {
  const revealed = state.phase !== 'ANSWERING'
  const groups = revealed ? buildGroups(state) : []
  return {
    phase: state.phase,
    round: state.round,
    question: { text: state.question.text, category: state.question.category },
    you: {
      status: state.roundPlayers.includes(viewerId) ? 'playing' : 'waiting',
      answer: state.answers[viewerId]?.text ?? null,
    },
    roundPlayers: state.roundPlayers,
    answered: state.roundPlayers.filter((id) => id in state.answers),
    deadline: state.phase === 'ANSWERING' ? state.deadline : null,
    scores: state.scores,
    blackSheepId: state.blackSheepId,
    groups,
    flockId: revealed ? flockOf(groups) : null,
    result: state.phase === 'RESULTS' ? state.result : null,
  }
}

// ---------------------------------------------------------------- module

export const herd = defineGame<HerdState, ClientAction, HerdTimer, HerdView, HerdSettings, PreparedQuestion>({
  ...meta,
  settingsSchema,
  defaultSettings,
  actionSchema: clientActionSchema,

  init: (ctx) => startRound(null, ctx, ctx.prepared),
  reduce,
  onTimer,
  view,

  onPlayerDisconnected: (state, _playerId, ctx) => maybeReveal(state, ctx),

  onPlayerRemoved(state, playerId, ctx) {
    const next: HerdState = {
      ...state,
      scores: withoutPlayer(state.scores, playerId),
      blackSheepId: state.blackSheepId === playerId ? null : state.blackSheepId,
    }
    // RESULTS keeps the round as scored; earlier, their answer leaves with them.
    if (!state.roundPlayers.includes(playerId) || state.phase === 'RESULTS') return { state: next }
    return maybeReveal(
      {
        ...next,
        roundPlayers: state.roundPlayers.filter((id) => id !== playerId),
        answers: withoutPlayer(state.answers, playerId),
      },
      ctx,
    )
  },

  secrets: [
    {
      // While answering, a viewer's view must not change when someone else's answer does,
      // including to the viewer's own answer (no "someone matches you" tell).
      name: 'answers',
      visibleTo: (s) => s.phase !== 'ANSWERING',
      variants: (s, viewerId) => {
        const mine = s.answers[viewerId]?.text
        return Object.keys(s.answers)
          .filter((id) => id !== viewerId)
          .flatMap((id) =>
            ['Zz Variant Answer', ...(mine ? [mine] : [])]
              .filter((text) => text !== s.answers[id]!.text)
              .map((text) => ({ ...s, answers: { ...s.answers, [id]: { text, key: normalizeAnswer(text) } } })),
          )
      },
    },
  ],
})
