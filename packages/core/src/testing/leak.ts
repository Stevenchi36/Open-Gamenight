/**
 * Generic secret-leak harness. For any game with a `secrets` spec, it plays
 * random action sequences and checks, after every step, that each player's
 * view() hides what that player may not see (see SecretDef in contract.ts).
 *
 * Framework-agnostic: it returns leaks; tests assert the list is empty.
 */
import type { GameModule, PlayerId } from '../contract.ts'
import { createRng } from '../rng.ts'
import { createSim, type GameSim, type SimOptions } from './sim.ts'

export interface Leak {
  secret: string
  viewerId: PlayerId
  /** 'value': a forbidden string appears in the view. 'variant': the view changes with the secret. */
  kind: 'value' | 'variant'
  detail: string
}

/** Check one state for every viewer. */
export function findLeaks<S, A, V, Settings, P>(
  game: GameModule<S, A, V, Settings, P>,
  state: S,
  viewerIds: readonly PlayerId[],
): Leak[] {
  const leaks: Leak[] = []
  for (const secret of game.secrets ?? []) {
    const forbidden = (secret.values?.(state) ?? []).map(normalize).filter((v) => v !== '')
    const variants = secret.variants?.(state) ?? []

    for (const viewerId of viewerIds) {
      if (secret.visibleTo(state, viewerId)) continue
      const view = game.view(state, viewerId)

      if (forbidden.length > 0) {
        const seen = new Set(collectStrings(view).map(normalize))
        for (const value of forbidden) {
          if (seen.has(value)) {
            leaks.push({ secret: secret.name, viewerId, kind: 'value', detail: `view contains "${value}"` })
          }
        }
      }

      if (variants.length > 0) {
        const base = stableStringify(view)
        variants.forEach((variant, i) => {
          if (secret.visibleTo(variant, viewerId)) return
          const other = stableStringify(game.view(variant, viewerId))
          if (other !== base) {
            leaks.push({
              secret: secret.name,
              viewerId,
              kind: 'variant',
              detail: `view differs for variant #${i}: ${firstDifference(base, other)}`,
            })
          }
        })
      }
    }
  }
  return leaks
}

export interface Move<A> {
  actorId: PlayerId
  action: A
}

export interface LeakTestOptions<S, A, V, Settings, P> extends Omit<SimOptions<S, A, Settings, P>, 'seed'> {
  /** One random playthrough per seed. Defaults to seeds 1..25. */
  seeds?: number[]
  /** Steps per playthrough. Defaults to 200. */
  maxSteps?: number
  /**
   * Candidate moves in the current state; one is picked at random per step.
   * Invalid moves are fine (rejected ones are skipped), but include the moves
   * that progress the game so every phase is reached.
   */
  moves(sim: GameSim<S, A, V, Settings, P>): Move<A>[]
  /** Per-step chance of toggling a random player's connection. Defaults to 0.1. */
  disconnectChance?: number
  /** Per-step chance of firing the next pending timer instead of a move. Defaults to 0.2. */
  timerChance?: number
  /** Stop collecting after this many leaks. Defaults to 20. */
  maxLeaks?: number
}

export interface LeakTestResult {
  leaks: Array<Leak & { seed: number; step: number }>
  statesChecked: number
  /** Distinct values of state.phase seen (when state has a `phase`), to confirm coverage. */
  phasesSeen: string[]
}

export function runLeakTest<S, A, V, Settings, P>(
  game: GameModule<S, A, V, Settings, P>,
  options: LeakTestOptions<S, A, V, Settings, P>,
): LeakTestResult {
  const {
    seeds = Array.from({ length: 25 }, (_, i) => i + 1),
    maxSteps = 200,
    moves,
    disconnectChance = 0.1,
    timerChance = 0.2,
    maxLeaks = 20,
    ...simOptions
  } = options
  if (!game.secrets?.length) throw new Error(`runLeakTest: game "${game.id}" declares no secrets`)

  const result: LeakTestResult = { leaks: [], statesChecked: 0, phasesSeen: [] }
  const phases = new Set<string>()

  for (const seed of seeds) {
    const sim = createSim(game, { ...simOptions, seed })
    const pick = createRng(seed ^ 0x9e3779b9)

    const check = (step: number) => {
      result.statesChecked++
      const phase = (sim.state as { phase?: unknown }).phase
      if (typeof phase === 'string') phases.add(phase)
      for (const leak of findLeaks(game, sim.state, sim.players.map((p) => p.id))) {
        if (result.leaks.length < maxLeaks) result.leaks.push({ ...leak, seed, step })
      }
    }

    check(0)
    for (let step = 1; step <= maxSteps && !sim.over && result.leaks.length < maxLeaks; step++) {
      const roll = pick.next()
      if (roll < disconnectChance) {
        const player = pick.pick(sim.players)
        if (player.connected) sim.disconnect(player.id)
        else sim.reconnect(player.id)
      } else if (roll < disconnectChance + timerChance && sim.timers.size > 0) {
        sim.fireNext()
      } else {
        const candidates = moves(sim)
        if (candidates.length === 0) {
          if (!sim.fireNext()) break // stuck: nothing to do and nothing pending
        } else {
          const move = pick.pick(candidates)
          sim.act(move.actorId, move.action)
        }
      }
      check(step)
    }
  }

  result.phasesSeen = [...phases].sort()
  return result
}

/** Every string value and object key in a JSON-serializable value. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out)
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      out.push(key)
      collectStrings(item, out)
    }
  }
  return out
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

/** JSON with object keys sorted, so equal views compare equal as strings. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}

function firstDifference(a: string, b: string): string {
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  const from = Math.max(0, i - 30)
  return `...${a.slice(from, i + 30)}... vs ...${b.slice(from, i + 30)}...`
}
