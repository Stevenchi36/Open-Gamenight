import { describe, expect, it } from 'vitest'
import type { PlayerInfo } from '../src/contract.ts'
import {
  addPoints,
  carryScores,
  dropBallots,
  isConnected,
  isPresent,
  nextTurnOrder,
  pickConnected,
  secretBallots,
  tallyVotes,
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

describe('tallyVotes', () => {
  it('counts ballots and names the sole leader', () => {
    expect(tallyVotes({ a: 'c', b: 'c', c: 'a' }, ['a', 'b', 'c'])).toEqual({
      votes: { c: 2, a: 1 },
      ballots: { a: 'c', b: 'c', c: 'a' },
      leaderId: 'c',
    })
  })

  it('has no leader on a tie or with no votes', () => {
    expect(tallyVotes({ a: 'b', b: 'a' }, ['a', 'b']).leaderId).toBeNull()
    expect(tallyVotes({}, ['a', 'b']).leaderId).toBeNull()
  })

  it('ignores ballots by or for players outside the eligible list', () => {
    const tally = tallyVotes({ a: 'b', gone: 'b', c: 'gone' }, ['a', 'b', 'c'])
    expect(tally.votes).toEqual({ b: 1 })
    expect(tally.ballots).toEqual({ a: 'b' })
  })
})

describe('dropBallots', () => {
  it('drops ballots cast by or for the player', () => {
    expect(dropBallots({ a: 'b', b: 'c', c: 'a' }, 'a')).toEqual({ b: 'c' })
  })
})

describe('secretBallots', () => {
  interface S {
    open: boolean
    players: string[]
    ballots: Record<string, string>
  }
  const secret = secretBallots<S>({
    visibleTo: (s) => !s.open,
    ballots: (s) => s.ballots,
    candidates: (s) => s.players,
    withBallots: (s, ballots) => ({ ...s, ballots }),
  })
  const state: S = { open: true, players: ['a', 'b', 'c'], ballots: { a: 'b', b: 'c' } }

  it("moves every other voter's ballot, keeping the viewer's own", () => {
    expect(secret.name).toBe('ballots')
    expect(secret.visibleTo(state, 'a')).toBe(false)
    const variants = secret.variants!(state, 'a')
    expect(variants.map((v) => v.ballots)).toEqual([{ a: 'b', b: 'a' }])
  })
})
