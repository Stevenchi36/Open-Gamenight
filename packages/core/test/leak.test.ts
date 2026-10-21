import { describe, expect, it } from 'vitest'
import { findLeaks, runLeakTest, type Move } from '../src/testing/leak.ts'
import { createSim, type GameSim } from '../src/testing/sim.ts'
import { makeOracle, players, type OracleAction } from './fixtures/oracle.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const oracleMoves = (sim: GameSim<any, OracleAction, any, any, any>): Move<OracleAction>[] => [
  ...sim.players.flatMap((p) =>
    ['pear', 'plum', 'banana'].map((word) => ({ actorId: p.id, action: { type: 'guess' as const, word } })),
  ),
  { actorId: sim.hostId, action: { type: 'reveal' } },
]

const leakOptions = { players, prepare: () => ({ word: 'Banana' }), moves: oracleMoves }

describe('runLeakTest', () => {
  it('passes a game that hides its secrets, and reaches every phase', () => {
    const result = runLeakTest(makeOracle(), leakOptions)
    expect(result.leaks).toEqual([])
    expect(result.phasesSeen).toEqual(['done', 'guessing'])
    expect(result.statesChecked).toBeGreaterThan(50)
  })

  it('catches a secret word in the view (value check)', () => {
    const { leaks } = runLeakTest(makeOracle({ leak: 'word' }), leakOptions)
    expect(leaks.length).toBeGreaterThan(0)
    expect(leaks.some((l) => l.secret === 'word' && l.kind === 'value')).toBe(true)
  })

  it('catches a secret player id that a string search would miss (variant check)', () => {
    const { leaks } = runLeakTest(makeOracle({ leak: 'oracle' }), leakOptions)
    expect(leaks.length).toBeGreaterThan(0)
    expect(leaks.every((l) => l.secret === 'oracleId' && l.kind === 'variant')).toBe(true)
  })

  it('refuses a game without a secrets spec', () => {
    expect(() => runLeakTest({ ...makeOracle(), secrets: undefined }, leakOptions)).toThrow(/declares no secrets/)
  })
})

describe('findLeaks', () => {
  it('matches values case-insensitively and in object keys', () => {
    const base = makeOracle()
    const game = { ...base, view: () => ({ notes: { BANANA: true } }) }
    const sim = createSim(base, { players, prepare: () => ({ word: 'banana' }) })
    const leaks = findLeaks(game, sim.state, ['p1', 'p2', 'p3', 'p4'])
    expect(leaks.filter((l) => l.kind === 'value')).toHaveLength(3) // everyone but the oracle
  })

  it('skips viewers allowed to see the secret', () => {
    const game = makeOracle({ leak: 'word' })
    const sim = createSim(game, { players, prepare: () => ({ word: 'banana' }) })
    const leaks = findLeaks(game, sim.state, [sim.state.oracleId])
    expect(leaks).toEqual([])
  })
})
