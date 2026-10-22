import { describe, expect, it } from 'vitest'
import type { PlayerInfo } from '../src/contract.ts'
import {
  addPoints,
  carryScores,
  isConnected,
  isPresent,
  nextTurnOrder,
  pickConnected,
  withoutPlayer,
} from '../src/kit.ts'
import { createRng } from '../src/rng.ts'

const player = (id: string, connected = true): PlayerInfo => ({ id, name: id, connected, isLoggedIn: false })

describe('presence', () => {
  const ctx = { players: [player('a'), player('b', false)], hostId: 'a' }

  it('tells present from connected', () => {
    expect(isPresent(ctx, 'b')).toBe(true)
    expect(isConnected(ctx, 'b')).toBe(false)
    expect(isPresent(ctx, 'gone')).toBe(false)
    expect(isConnected(ctx, 'gone')).toBe(false)
  })
})

describe('pickConnected', () => {
  const players = [player('a'), player('b', false), player('c'), player('d')]

  it('prefers the host when eligible', () => {
    expect(pickConnected({ players, hostId: 'c' }, ['d', 'c'])).toBe('c')
  })

  it('otherwise takes the first connected candidate in join order', () => {
    expect(pickConnected({ players, hostId: 'a' }, ['d', 'b', 'c'])).toBe('c')
  })

  it('returns null when no candidate is connected', () => {
    expect(pickConnected({ players, hostId: 'a' }, ['b', 'gone'])).toBeNull()
  })
})

describe('nextTurnOrder', () => {
  const rng = () => createRng(1)

  it('shuffles on the first round', () => {
    const order = nextTurnOrder(null, ['a', 'b', 'c', 'd'], rng(), 'rotate')
    expect([...order].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(order).toEqual(createRng(1).shuffle(['a', 'b', 'c', 'd']))
  })

  it('rotate: moves the order on one seat', () => {
    expect(nextTurnOrder(['c', 'a', 'b'], ['a', 'b', 'c'], rng(), 'rotate')).toEqual(['a', 'b', 'c'])
  })

  it('rotate: drops leavers and appends newcomers', () => {
    expect(nextTurnOrder(['c', 'a', 'b'], ['b', 'c', 'd'], rng(), 'rotate')).toEqual(['b', 'c', 'd'])
  })

  it('random, or a one-off shuffle: reshuffles', () => {
    const expected = createRng(1).shuffle(['a', 'b', 'c'])
    expect(nextTurnOrder(['c', 'a', 'b'], ['a', 'b', 'c'], rng(), 'random')).toEqual(expected)
    expect(nextTurnOrder(['c', 'a', 'b'], ['a', 'b', 'c'], rng(), 'rotate', true)).toEqual(expected)
  })
})

describe('scores', () => {
  it('carries scores over, adds newcomers at 0 and drops leavers', () => {
    expect(carryScores({ a: 3, gone: 1 }, ['a', 'b'])).toEqual({ a: 3, b: 0 })
    expect(carryScores(undefined, ['a'])).toEqual({ a: 0 })
  })

  it('adds points without touching the input', () => {
    const scores = { a: 1, b: 2 }
    expect(addPoints(scores, { a: 2, c: 1 })).toEqual({ a: 3, b: 2, c: 1 })
    expect(scores).toEqual({ a: 1, b: 2 })
  })

  it('removes one player from a record', () => {
    expect(withoutPlayer({ a: 1, b: 2 }, 'a')).toEqual({ b: 2 })
  })
})
