import { describe, expect, it } from 'vitest'
import { assertPlainData, createSim } from '../src/testing/sim.ts'
import { makeOracle, players, ROUND_MS } from './fixtures/oracle.ts'

const game = makeOracle()
const newSim = (seed = 1) => createSim(game, { players, seed, now: 1000, prepare: () => ({ word: 'Banana' }) })

describe('GameSim', () => {
  it('runs init with prepared data and schedules the round timer', () => {
    const sim = newSim()
    expect(sim.state.word).toBe('Banana')
    expect(sim.timers.get('round')).toEqual({ at: 1000 + ROUND_MS, action: { type: 'time_up' } })
  })

  it('is deterministic per seed', () => {
    expect(newSim(5).state.oracleId).toBe(newSim(5).state.oracleId)
  })

  it('validates actions with actionSchema and returns game errors', () => {
    const sim = newSim()
    const guesser = players.find((p) => p.id !== sim.state.oracleId)!.id
    expect(sim.act(guesser, { type: 'guess' })).toMatchObject({ ok: false, error: expect.stringMatching(/^validation/) })
    expect(sim.act(sim.state.oracleId, { type: 'guess', word: 'x' })).toEqual({
      ok: false,
      error: 'The oracle cannot guess',
    })
    expect(sim.act('nobody', { type: 'reveal' }).ok).toBe(false)
    expect(sim.act(guesser, { type: 'guess', word: 'pear' })).toEqual({ ok: true })
  })

  it('rejects timer actions sent by a player', () => {
    const sim = newSim()
    expect(sim.act('p1', { type: 'time_up' })).toMatchObject({ ok: false, error: expect.stringMatching(/^validation/) })
  })

  it('fires timers on advance, through onTimer', () => {
    const sim = newSim()
    sim.advance(ROUND_MS - 1)
    expect(sim.state.phase).toBe('guessing')
    sim.advance(1)
    expect(sim.state.phase).toBe('done')
    expect(sim.now).toBe(1000 + ROUND_MS)
    expect(sim.timers.size).toBe(0)
    expect(sim.noticesFor('p3')).toEqual(['Time is up'])
  })

  it('cancel effects remove timers', () => {
    const sim = newSim()
    const guesser = players.find((p) => p.id !== sim.state.oracleId)!.id
    sim.act(guesser, { type: 'guess', word: 'banana' })
    expect(sim.state).toMatchObject({ phase: 'done', winnerId: guesser })
    expect(sim.timers.size).toBe(0)
  })

  it('resolves host notices and runs lifecycle hooks', () => {
    const sim = newSim()
    sim.disconnect(sim.state.oracleId)
    expect(sim.players.find((p) => p.id === sim.state.oracleId)?.connected).toBe(false)
    expect(sim.notices).toEqual([{ to: ['p1'], message: 'The oracle disconnected' }])
  })

  it('stops after gameOver', () => {
    const sim = newSim()
    sim.act('p1', { type: 'reveal' })
    sim.act('p1', { type: 'reveal' })
    expect(sim.over).toBe(true)
    expect(sim.act('p1', { type: 'reveal' })).toEqual({ ok: false, error: 'game is over' })
  })

  it('rejects game state that is not plain JSON data', () => {
    expect(() => assertPlainData({ a: [1, 'x', null, { b: true }], c: undefined }, 'state')).not.toThrow()
    expect(() => assertPlainData({ seen: new Set(['p1']) }, 'state')).toThrow('state.seen is a Set')
    expect(() => assertPlainData({ at: new Date(0) }, 'state')).toThrow('state.at is a Date')
    expect(() => assertPlainData({ n: [Number.NaN] }, 'state')).toThrow('state.n[0] is NaN')
    expect(() => assertPlainData({ list: [undefined] }, 'state')).toThrow('state.list[0] is undefined')
    expect(() => assertPlainData({ f: () => 1 }, 'state')).toThrow('state.f is a function')
  })

  it('passes host to the next player when the host is removed', () => {
    const sim = newSim()
    sim.remove('p1')
    expect(sim.hostId).toBe('p2')
    expect(sim.players.map((p) => p.id)).toEqual(['p2', 'p3', 'p4'])
  })
})
