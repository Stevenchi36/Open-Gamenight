/**
 * In Order: pure init / reduce / view, plus the secrets spec checked by the
 * core leak test. No I/O here; the theme arrives through ctx.prepared (from
 * prepareRound) or is picked from the starter list with ctx.rng.
 *
 * ORDERING -> RESULTS -> next_round -> ORDERING   (new_game after the game ends)
 */
import { defineGame, gameError, type BaseCtx, type Effect, type GameError, type PlayerId, type ReduceCtx, type Transition } from '@wsfg/core/contract'
import { isConnected } from '@wsfg/core/kit'
import {
  clientActionSchema,
  defaultSettings,
  MAX_NUMBER,
  meta,
  MIN_PLAYERS,
  settingsSchema,
  type ClientAction,
  type InOrderSettings,
  type InOrderView,
  type Outcome,
  type Phase,
  type RoundResult,
  type Theme,
} from '../shared/index.ts'
import { DEFAULT_THEME_LIST } from './default-themes.ts'
import { validateClue } from './validate.ts'

// ---------------------------------------------------------------- state

export interface ThemeRef extends Theme {
  /** Library row id; null for starter-list themes. */
  id: number | null
}

/** What prepareRound hands to init / next_round / new_game: a library theme, or "use the starter list" with a notice for the host. */
export type PreparedTheme = (ThemeRef & { notice?: string }) | { builtin: true; notice: string }

export interface Card {
  id: string
  playerId: PlayerId
  /** Secret until RESULTS: only the owner sees it. */
  number: number
  clue: string | null
}

export interface InOrderState {
  /** Snapshot at round start; settings only change in the lobby. */
  settings: InOrderSettings
  phase: Phase
  round: number
  theme: ThemeRef
  /** Players in this round, in join order. Late joiners wait for the next round. */
  roundPlayers: PlayerId[]
  cards: Record<string, Card>
  /** Card ids in the order the table has placed them, lowest first. */
  line: string[]
  ready: PlayerId[]
  lives: number
  cleared: number
  perfect: number
  result: RoundResult | null
  /** Starter themes used this game ("category|theme", lower case). */
  usedBuiltin: string[]
  /** Library theme ids used this game; prepareRound excludes them. */
  usedThemeIds: number[]
}

type Ctx = BaseCtx<InOrderSettings>
type Step = Transition<InOrderState, never>

// ---------------------------------------------------------------- scoring

/**
 * Indices of one longest increasing run in `numbers` (a longest increasing
 * subsequence). Every card outside it is a mistake: moving just those fixes the line.
 */
export function longestRun(numbers: readonly number[]): number[] {
  const length: number[] = []
  const prev: number[] = []
  let end = -1
  numbers.forEach((n, i) => {
    length[i] = 1
    prev[i] = -1
    for (let j = 0; j < i; j++) {
      if (numbers[j]! < n && length[j]! + 1 > length[i]!) {
        length[i] = length[j]! + 1
        prev[i] = j
      }
    }
    if (end === -1 || length[i]! > length[end]!) end = i
  })
  const run: number[] = []
  for (let i = end; i !== -1; i = prev[i]!) run.unshift(i)
  return run
}

// ---------------------------------------------------------------- transitions

const builtinKey = (t: { category: string; theme: string }) => `${t.category}|${t.theme}`.toLowerCase()

function chooseTheme(
  ctx: Ctx,
  prepared: PreparedTheme | undefined,
  usedBuiltin: string[],
  usedThemeIds: number[],
): { theme: ThemeRef; usedBuiltin: string[]; usedThemeIds: number[]; notice?: string } {
  if (prepared && !('builtin' in prepared)) {
    const { notice, ...theme } = prepared
    return {
      theme,
      usedBuiltin,
      usedThemeIds: theme.id === null ? usedThemeIds : [...usedThemeIds, theme.id],
      ...(notice ? { notice } : {}),
    }
  }
  const notice = prepared?.notice
  const wanted = ctx.settings.category?.toLowerCase()
  const inCategory = DEFAULT_THEME_LIST.filter((t) => !wanted || t.category.toLowerCase() === wanted)
  const pool = inCategory.length > 0 ? inCategory : DEFAULT_THEME_LIST
  const fresh = pool.filter((t) => !usedBuiltin.includes(builtinKey(t)))
  const picked = ctx.rng.pick(fresh.length > 0 ? fresh : pool)
  return {
    theme: { id: null, category: picked.category, text: picked.theme, low: picked.low, high: picked.high },
    usedBuiltin: [...usedBuiltin, builtinKey(picked)],
    usedThemeIds,
    ...(notice ? { notice } : {}),
  }
}

/** A new round: a theme and fresh numbers. `fresh` (new_game, or the first round): lives and the team's counts start over. */
function startRound(prev: InOrderState | null, ctx: Ctx, prepared: PreparedTheme | undefined, fresh = false): Step {
  const ids = ctx.players.map((p) => p.id)
  const each = ctx.settings.numbersEach
  const chosen = chooseTheme(ctx, prepared, prev?.usedBuiltin ?? [], prev?.usedThemeIds ?? [])
  const numbers = ctx.rng.shuffle(Array.from({ length: MAX_NUMBER }, (_, i) => i + 1))
  const restart = fresh || !prev

  const cards: Record<string, Card> = {}
  const line: string[] = []
  ids.forEach((playerId, i) => {
    for (let k = 0; k < each; k++) {
      // Ids follow deal order, never the numbers, so the starting line hints nothing.
      const id = `${playerId}#${k}`
      cards[id] = { id, playerId, number: numbers[i * each + k]!, clue: null }
      line.push(id)
    }
  })

  const state: InOrderState = {
    settings: ctx.settings,
    phase: 'ORDERING',
    round: restart ? 1 : prev.round + 1,
    theme: chosen.theme,
    roundPlayers: ids,
    cards,
    line,
    ready: [],
    lives: restart ? ctx.settings.lives : prev.lives,
    cleared: restart ? 0 : prev.cleared,
    perfect: restart ? 0 : prev.perfect,
    result: null,
    usedBuiltin: chosen.usedBuiltin,
    usedThemeIds: chosen.usedThemeIds,
  }
  const effects: Effect<never>[] = chosen.notice ? [{ type: 'notice', to: 'host', message: chosen.notice }] : []
  return { state, effects }
}

/** The line is revealed once every connected round player is ready. */
function maybeReveal(state: InOrderState, ctx: Ctx): Step {
  if (state.phase !== 'ORDERING') return { state }
  const waitingOn = state.roundPlayers.filter((id) => isConnected(ctx, id))
  if (waitingOn.length > 0 && waitingOn.every((id) => state.ready.includes(id))) return reveal(state)
  return { state }
}

function reveal(state: InOrderState): Step {
  const run = new Set(longestRun(state.line.map((id) => state.cards[id]!.number)))
  const wrong = state.line.filter((_, i) => !run.has(i))
  const lives = Math.max(0, state.lives - wrong.length)
  const { rounds } = state.settings
  const outcome: Outcome | null = lives === 0 ? 'lost' : rounds !== null && state.round >= rounds ? 'won' : null
  return {
    state: {
      ...state,
      phase: 'RESULTS',
      ready: [],
      lives,
      cleared: state.cleared + (lives > 0 ? 1 : 0),
      perfect: state.perfect + (wrong.length === 0 ? 1 : 0),
      result: { livesLost: wrong.length, wrong, outcome },
    },
  }
}

/** A change to the line or a clue: everyone has to agree again. */
const changed = (state: InOrderState, patch: Partial<InOrderState>): Step => ({ state: { ...state, ...patch, ready: [] } })

// ---------------------------------------------------------------- reducer

function reduce(state: InOrderState, action: ClientAction, ctx: ReduceCtx<InOrderSettings, PreparedTheme>): Step | GameError {
  const actor = ctx.actorId
  const isHost = actor === ctx.hostId
  const inRound = state.roundPlayers.includes(actor)

  switch (action.type) {
    case 'submit_clue': {
      if (state.phase !== 'ORDERING') return gameError('The line has been revealed')
      const card = state.cards[action.itemId]
      if (!card || card.playerId !== actor) return gameError('That is not your card')
      const checked = validateClue(action.text, card.number)
      if (!checked.ok) return gameError(checked.error)
      if (checked.value === card.clue) return { state }
      return changed(state, { cards: { ...state.cards, [card.id]: { ...card, clue: checked.value } } })
    }

    case 'move_item': {
      if (state.phase !== 'ORDERING') return gameError('The line has been revealed')
      if (!inRound) return gameError('You are not in this round')
      const from = state.line.indexOf(action.itemId)
      if (from === -1) return gameError('That card is not in the line')
      const to = Math.min(action.to, state.line.length - 1)
      if (to === from) return { state }
      const line = state.line.filter((id) => id !== action.itemId)
      line.splice(to, 0, action.itemId)
      return changed(state, { line })
    }

    case 'set_ready': {
      if (state.phase !== 'ORDERING') return gameError('The line has been revealed')
      if (!inRound) return gameError('You are not in this round')
      const others = state.ready.filter((id) => id !== actor)
      if (!action.ready) return { state: { ...state, ready: others } }
      const unclued = Object.values(state.cards).some((c) => c.playerId === actor && c.clue === null)
      if (unclued) return gameError('Give each of your numbers a clue first')
      return maybeReveal({ ...state, ready: [...others, actor] }, ctx)
    }

    case 'reveal_now':
      if (!isHost) return gameError('Only the host can reveal the line')
      if (state.phase !== 'ORDERING') return gameError('The line is already revealed')
      return reveal(state)

    case 'next_round':
      if (!isHost) return gameError('Only the host can start the next round')
      if (state.phase !== 'RESULTS') return gameError('The round is not over yet')
      if (state.result?.outcome) return gameError('The game is over: start a new game')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startRound(state, ctx, ctx.prepared)

    case 'new_game':
      if (!isHost) return gameError('Only the host can start a new game')
      if (state.phase !== 'RESULTS' || !state.result?.outcome) return gameError('The game is not over yet')
      if (ctx.players.length < MIN_PLAYERS) return gameError(`Need at least ${MIN_PLAYERS} players`)
      return startRound(state, ctx, ctx.prepared, true)
  }
}

// ---------------------------------------------------------------- view

function view(state: InOrderState, viewerId: PlayerId): InOrderView {
  const revealed = state.phase === 'RESULTS'
  const cards = Object.values(state.cards)
  return {
    phase: state.phase,
    round: state.round,
    totalRounds: state.settings.rounds,
    lives: state.lives,
    maxLives: state.settings.lives,
    cleared: state.cleared,
    perfect: state.perfect,
    theme: { text: state.theme.text, low: state.theme.low, high: state.theme.high, category: state.theme.category },
    you: {
      status: state.roundPlayers.includes(viewerId) ? 'playing' : 'waiting',
      cards: cards
        .filter((c) => c.playerId === viewerId)
        .sort((a, b) => a.number - b.number)
        .map((c) => ({ id: c.id, number: c.number, clue: c.clue })),
    },
    roundPlayers: state.roundPlayers,
    line: state.line.map((id) => {
      const card = state.cards[id]!
      return { id, playerId: card.playerId, clue: card.clue, number: revealed ? card.number : null }
    }),
    ready: state.ready,
    result: revealed ? state.result : null,
  }
}

// ---------------------------------------------------------------- module

export const inOrder = defineGame<InOrderState, ClientAction, never, InOrderView, InOrderSettings, PreparedTheme>({
  ...meta,
  settingsSchema,
  defaultSettings,
  actionSchema: clientActionSchema,

  init: (ctx) => startRound(null, ctx, ctx.prepared),
  reduce,
  view,

  onPlayerDisconnected: (state, _playerId, ctx) => maybeReveal(state, ctx),

  onPlayerRemoved(state, playerId, ctx) {
    // RESULTS keeps the round as scored; earlier, their cards leave the line with them.
    if (!state.roundPlayers.includes(playerId) || state.phase === 'RESULTS') return { state }
    const cards = Object.fromEntries(Object.entries(state.cards).filter(([, c]) => c.playerId !== playerId))
    return maybeReveal(
      {
        ...state,
        roundPlayers: state.roundPlayers.filter((id) => id !== playerId),
        cards,
        line: state.line.filter((id) => id in cards),
        ready: state.ready.filter((id) => id !== playerId),
      },
      ctx,
    )
  },

  secrets: [
    {
      // Until RESULTS, a viewer's view must not change when other players' numbers do:
      // swapped between two of their cards, or replaced by a number nobody holds.
      // Each card swaps with the next only (not every pair), so the count stays linear.
      name: 'numbers',
      visibleTo: (s) => s.phase === 'RESULTS',
      variants: (s, viewerId) => {
        const others = Object.values(s.cards).filter((c) => c.playerId !== viewerId)
        const held = new Set(Object.values(s.cards).map((c) => c.number))
        const spare = Array.from({ length: MAX_NUMBER }, (_, i) => i + 1).find((n) => !held.has(n))
        const withNumbers = (patch: Record<string, number>): InOrderState => ({
          ...s,
          cards: Object.fromEntries(Object.entries(s.cards).map(([id, c]) => [id, id in patch ? { ...c, number: patch[id]! } : c])),
        })
        const variants: InOrderState[] = []
        others.forEach((a, i) => {
          const b = others[i + 1]
          if (b) variants.push(withNumbers({ [a.id]: b.number, [b.id]: a.number }))
          if (spare !== undefined) variants.push(withNumbers({ [a.id]: spare }))
        })
        return variants
      },
    },
  ],
})
