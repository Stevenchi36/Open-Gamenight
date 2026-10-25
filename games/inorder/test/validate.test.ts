import { describe, expect, it } from 'vitest'
import { validateClue, validateTheme } from '../server/validate.ts'

describe('validateClue', () => {
  it('trims and collapses spaces, and limits the length', () => {
    expect(validateClue('  a   kitten ', 12)).toEqual({ ok: true, value: 'a kitten' })
    expect(validateClue('', 12)).toEqual({ ok: false, error: 'Enter a clue' })
    expect(validateClue('x'.repeat(41), 12)).toEqual({ ok: false, error: 'At most 40 characters' })
  })

  it('refuses your own number as a number, with or without leading zeros', () => {
    for (const clue of ['7', 'about 7', '7 dwarfs', 'level 007', 'a 7/10']) {
      expect(validateClue(clue, 7)).toEqual({ ok: false, error: "Don't say your number" })
    }
  })

  it('allows other numbers, and your digits inside a longer number', () => {
    for (const clue of ['70 candles', '17 tigers', '101 Dalmatians', 'seven dwarfs']) {
      expect(validateClue(clue, 7).ok).toBe(true)
    }
    expect(validateClue('101 Dalmatians', 10).ok).toBe(true)
    expect(validateClue('101 Dalmatians', 101).ok).toBe(false)
  })
})

describe('validateTheme', () => {
  const ok = { category: 'Everyday Life', theme: 'How scary is it?', low: 'Not scary', high: 'Terrifying' }

  it('tidies spacing and accepts a good theme', () => {
    expect(validateTheme({ ...ok, theme: ' How  scary is it? ' })).toEqual({ ok: true, value: ok })
  })

  it('checks every field', () => {
    expect(validateTheme({ ...ok, category: ' ' })).toEqual({ ok: false, error: 'Category is required' })
    expect(validateTheme({ ...ok, theme: 'Hm?' })).toEqual({ ok: false, error: 'Theme must be at least 5 characters' })
    expect(validateTheme({ ...ok, theme: 'x'.repeat(81) })).toEqual({ ok: false, error: 'Theme must be at most 80 characters' })
    expect(validateTheme({ ...ok, low: '' })).toEqual({ ok: false, error: 'Both ends of the scale are required' })
    expect(validateTheme({ ...ok, high: 'x'.repeat(31) })).toEqual({ ok: false, error: 'Each end must be at most 30 characters' })
    expect(validateTheme({ ...ok, low: 'Scary', high: 'scary!' })).toEqual({ ok: false, error: 'The two ends must be different' })
  })
})
