import { describe, expect, it } from 'vitest'
import { createRng } from '../src/rng.ts'

describe('createRng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const c = createRng(43)
    const seqA = Array.from({ length: 5 }, () => a.next())
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA)
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(seqA)
  })

  it('int stays in range and covers it', () => {
    const rng = createRng(1)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(6)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(6)
      seen.add(n)
    }
    expect(seen.size).toBe(6)
  })

  it('rejects invalid bounds and empty picks', () => {
    const rng = createRng(1)
    expect(() => rng.int(0)).toThrow(RangeError)
    expect(() => rng.int(2.5)).toThrow(RangeError)
    expect(() => rng.pick([])).toThrow(RangeError)
  })

  it('shuffle returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = createRng(7).shuffle(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...out].sort((x, y) => x - y)).toEqual(input)
  })

  it('pick is roughly uniform', () => {
    const rng = createRng(3)
    const counts = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 3000; i++) counts[rng.pick(['a', 'b', 'c'] as const)]++
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(850)
  })
})
