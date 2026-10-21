import { describe, expect, it } from 'vitest'
import { createSim } from '../src/testing/sim.ts'
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

  it('treats players as unable to send system-only actions', () => {
    const sim = newSim()
    expect(sim.act('p1', { type: 'time_up' })).toEqual({ ok: false, error: 'Not allowed' })
  })

  it('fires timers on advance, with actorId null', () => {
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

  it('passes host to the next player when the host is removed', () => {
    const sim = newSim()
    sim.remove('p1')
    expect(sim.hostId).toBe('p2')
    expect(sim.players.map((p) => p.id)).toEqual(['p2', 'p3', 'p4'])
  })
})
