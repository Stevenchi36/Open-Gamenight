/**
 * Color Mix: pure init / reduce / onTimer / view, plus the secrets spec checked by
 * the core leak test. No I/O: colours come from ctx.rng, the answer from mixPaint.
 *
 * GUESSING -> RESULTS -> next_round -> GUESSING   (new_game after the last round)
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
  DIFFICULTIES,
  DIFFICULTY_COLORS,
  HEX_COLOR,
  meta,
  MIN_PLAYERS,
  settingsSchema,
  type ClientAction,
  type ColorMixSettings,
  type ColorMixView,
  type Phase,
  type RoundResult,
  type ScoredGuess,
} from '../shared/index.ts'
import { closeness, distanceBetween, randomColors } from './colors.ts'
import { mixPaint } from './spectral.ts'

// ---------------------------------------------------------------- state

export interface ColorMixState {
  /** Snapshot at round start; settings only change in the lobby. */
  settings: ColorMixSettings
  phase: Phase
  /** Round within this game, from 1 (resets on new_game). */
  round: number
  /** Increases every round, new games included; a timer from an earlier round is stale. */
  seq: number
  colors: string[]
  /** The colours mixed like paint. Secret while GUESSING. */
  target: string
  /** Players in this round, in join order. Late joiners wait for the next round. */
  roundPlayers: PlayerId[]
  /** Secret while GUESSING: each player sees only their own. Lower-case `#rrggbb`. */
  guesses: Record<PlayerId, string>
  deadline: number | null
  scores: Scores
  result: RoundResult | null
}

/** Scheduled by the game itself and handled by onTimer; `seq` makes a stale timer a no-op. */
export type ColorMixTimer = { type: 'guess_timeout'; seq: number }

type Ctx = BaseCtx<ColorMixSettings>
type Step = Transition<ColorMixState, ColorMixTimer>
type Fx = Effect<ColorMixTimer>[]

const CANCEL_TIMER: Effect<ColorMixTimer> = { type: 'cancel', key: 'guess_timer' }

// ---------------------------------------------------------------- transitions

/** A new round. `fresh` (new_game): scores and the round count start over. */
function startRound(prev: ColorMixState | null, ctx: Ctx, fresh = false): Step {
  const ids = ctx.players.map((p) => p.id)
  const { difficulty, guessTimerSeconds } = ctx.settings
  const level = difficulty === 'all' ? DIFFICULTIES[ctx.rng.int(DIFFICULTIES.length)]! : difficulty
  const colors = randomColors(ctx.rng, DIFFICULTY_COLORS[level])
  const deadline = guessTimerSeconds ? ctx.now + guessTimerSeconds * 1000 : null
  const seq = (prev?.seq ?? 0) + 1

  const state: ColorMixState = {
    settings: ctx.settings,
    phase: 'GUESSING',
    round: fresh || !prev ? 1 : prev.round + 1,
    seq,
    colors,
    target: mixPaint(colors),
    roundPlayers: ids,
    guesses: {},
    deadline,
    scores: carryScores(fresh ? undefined : prev?.scores, ids),
    result: null,
  }
  const effects: Fx = [CANCEL_TIMER]
  if (deadline !== null) effects.push({ type: 'schedule', key: 'guess_timer', at: deadline, action: { type: 'guess_timeout', seq } })
  return { state, effects }
}

/** Guesses are revealed once every connected round player has guessed. */
function maybeReveal(state: ColorMixState, ctx: Ctx): Step {
  if (state.phase !== 'GUESSING') return { state }
  const waitingOn = state.roundPlayers.filter((id) => isConnected(ctx, id))
  if (waitingOn.length > 0 && waitingOn.every((id) => id in state.guesses)) return scoreRound(state)
  return { state }
}

// Rounded so equal guesses tie exactly and the view carries tidy numbers.
const roundDistance = (d: number) => Math.round(d * 1e6) / 1e6

/** Ranked: 1 point per round player further away (no guess counts as furthest). Closest: 1 point for the best. */
export function scoreGuesses(state: Pick<ColorMixState, 'roundPlayers' | 'guesses' | 'target' | 'settings'>): ScoredGuess[] {
  const guesses = state.roundPlayers
    .filter((id) => id in state.guesses)
    .map((playerId) => {
      const color = state.guesses[playerId]!
      const distance = roundDistance(distanceBetween(color, state.target))
      return { playerId, color, distance, closeness: closeness(distance), points: 0 }
    })
    .sort((a, b) => a.distance - b.distance)
  const noGuess = state.roundPlayers.length - guesses.length
  const best = guesses[0]?.distance
  for (const guess of guesses) {
    guess.points =
      state.settings.scoring === 'ranked'
        ? guesses.filter((g) => g.distance > guess.distance).length + noGuess
        : guess.distance === best
          ? 1
          : 0
  }
  return guesses
}

function scoreRound(state: ColorMixState): Step {
  const guesses = scoreGuesses(state)
  const points: Scores = {}
  for (const id of state.roundPlayers) points[id] = 0
  for (const guess of guesses) points[guess.playerId] = guess.points
  const scores = addPoints(state.scores, points)

  const { rounds } = state.settings
  const over = rounds !== null && state.round >= rounds
  const top = Math.max(...Object.values(scores))
  const winnerIds = over ? Object.keys(scores).filter((id) => scores[id] === top) : []

  return {
    state: { ...state, phase: 'RESULTS', deadline: null, scores, result: { guesses, pointsAwarded: points, winnerIds } },
    effects: [CANCEL_TIMER],
  }
}

// ---------------------------------------------------------------- reducer

function reduce(state: ColorMixState, action: ClientAction, ctx: ReduceCtx<ColorMixSettings>): Step | GameError {
  const actor = ctx.actorId
  const isHost = actor === ctx.hostId

  switch (action.type) {
    case 'submit_guess': {
      if (state.phase !== 'GUESSING') return gameError('Guesses are closed')
      if (!state.roundPlayers.includes(actor)) return gameError('You are not in this round')
      if (!HEX_COLOR.test(action.color)) return gameError('Pick a colour')
      return maybeReveal({ ...state, guesses: { ...state.guesses, [actor]: action.color.toLowerCase() } }, ctx)
    }

    case 'reveal_guesses':
      if (!isHost) return gameError('Only the host can reveal the guesses')
      if (state.phase !== 'GUESSING') return gameError('The guesses are already revealed')
      return scoreRound(state)

    case 'next_round':
      if (!isHost) return gameError('Only the host can start the next round')
      if (state.phase !== 'RESULTS') return gameError('The round is not over yet')
      if (state.result?.winnerIds.length) return gameError('The game is over: start a new game')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startRound(state, ctx)

    case 'new_game':
      if (!isHost) return gameError('Only the host can start a new game')
      if (state.phase !== 'RESULTS' || !state.result?.winnerIds.length) return gameError('The game is not over yet')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startRound(state, ctx, true)
  }
}

/** A stale timer (earlier round, or guesses already revealed) is a no-op. */
function onTimer(state: ColorMixState, action: ColorMixTimer, _ctx: TimerCtx<ColorMixSettings>): Step {
  if (action.seq !== state.seq || state.phase !== 'GUESSING') return { state }
  return scoreRound(state)
}

// ---------------------------------------------------------------- view

function view(state: ColorMixState, viewerId: PlayerId): ColorMixView {
  const results = state.phase === 'RESULTS'
  return {
    phase: state.phase,
    round: state.round,
    totalRounds: state.settings.rounds,
    colors: state.colors,
    you: {
      status: state.roundPlayers.includes(viewerId) ? 'playing' : 'waiting',
      guess: state.guesses[viewerId] ?? null,
    },
    roundPlayers: state.roundPlayers,
    guessed: state.roundPlayers.filter((id) => id in state.guesses),
    deadline: state.phase === 'GUESSING' ? state.deadline : null,
    scores: state.scores,
    target: results ? state.target : null,
    result: results ? state.result : null,
  }
}

// ---------------------------------------------------------------- module

const VARIANT_COLOR = '#123456'

export const colorMix = defineGame<ColorMixState, ClientAction, ColorMixTimer, ColorMixView, ColorMixSettings>({
  ...meta,
  settingsSchema,
  defaultSettings,
  actionSchema: clientActionSchema,

  init: (ctx) => startRound(null, ctx),
  reduce,
  onTimer,
  view,

  onPlayerDisconnected: (state, _playerId, ctx) => maybeReveal(state, ctx),

  onPlayerRemoved(state, playerId, ctx) {
    const next: ColorMixState = { ...state, scores: withoutPlayer(state.scores, playerId) }
    // RESULTS keeps the round as scored; earlier, their guess leaves with them.
    if (!state.roundPlayers.includes(playerId) || state.phase === 'RESULTS') return { state: next }
    return maybeReveal(
      {
        ...next,
        roundPlayers: state.roundPlayers.filter((id) => id !== playerId),
        guesses: withoutPlayer(state.guesses, playerId),
      },
      ctx,
    )
  },

  secrets: [
    {
      // While guessing, a viewer's view must not change when someone else's guess does,
      // including to the viewer's own guess (no "someone matches you" tell).
      name: 'guesses',
      visibleTo: (s) => s.phase !== 'GUESSING',
      variants: (s, viewerId) => {
        const mine = s.guesses[viewerId]
        return Object.keys(s.guesses)
          .filter((id) => id !== viewerId)
          .flatMap((id) =>
            [VARIANT_COLOR, ...(mine ? [mine] : [])]
              .filter((color) => color !== s.guesses[id])
              .map((color) => ({ ...s, guesses: { ...s.guesses, [id]: color } })),
          )
      },
    },
    {
      name: 'answer',
      visibleTo: (s) => s.phase !== 'GUESSING',
      variants: (s) => (s.target === VARIANT_COLOR ? [] : [{ ...s, target: VARIANT_COLOR }]),
    },
  ],
})
