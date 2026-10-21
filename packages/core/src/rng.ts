/**
 * Seeded pseudo-random number generator handed to games through their ctx.
 * Games never call Math.random; the runner owns the seed, so rounds are
 * reproducible in tests.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number
  /** Uniformly random element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T
  /** New array, Fisher-Yates shuffled. */
  shuffle<T>(items: readonly T[]): T[]
}

/** mulberry32: small, fast, good enough for party games (not for crypto). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`rng.int: maxExclusive must be a positive integer, got ${maxExclusive}`)
    }
    return Math.floor(next() * maxExclusive)
  }

  return {
    next,
    int,
    pick(items) {
      if (items.length === 0) throw new RangeError('rng.pick: empty array')
      return items[int(items.length)]!
    },
    shuffle(items) {
      const out = [...items]
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1)
        ;[out[i], out[j]] = [out[j]!, out[i]!]
      }
      return out
    },
  }
}
