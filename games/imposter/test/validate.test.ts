import { describe, expect, it } from 'vitest'
import { BUILTIN_CATEGORIES, BUILTIN_WORDS } from '../server/builtin-words.ts'
import { validateClueFormat, validateWord } from '../server/validate.ts'

describe('validateClueFormat', () => {
  it('trims and accepts one token', () => {
    expect(validateClueFormat('  frosty ')).toEqual({ ok: true, value: 'frosty' })
    expect(validateClueFormat('x'.repeat(24)).ok).toBe(true)
  })
  it('rejects empty, multi-word, long and control characters', () => {
    expect(validateClueFormat('   ').ok).toBe(false)
    expect(validateClueFormat('ice cold').ok).toBe(false)
    expect(validateClueFormat('x'.repeat(25)).ok).toBe(false)
    expect(validateClueFormat('a\u0007').ok).toBe(false)
  })
})

describe('validateWord', () => {
  const base = { category: 'Animals', word: 'Penguin', hint: 'Dressed for dinner' }
  it('normalizes and defaults difficulty', () => {
    expect(validateWord({ category: ' Animals ', word: '  Polar   Bear ', hint: ' Lives up north ' })).toEqual({
      ok: true,
      value: { category: 'Animals', word: 'Polar Bear', hint: 'Lives up north', difficulty: 'medium' },
    })
  })
  it.each([
    ['empty word', { word: ' ' }],
    ['four words', { word: 'one two three four' }],
    ['30-char word', { word: 'x'.repeat(30) }],
    ['40-char category', { category: 'x'.repeat(40) }],
    ['120-char hint', { hint: 'x'.repeat(120) }],
    ['hint contains the word', { hint: 'A PENGUIN in a suit' }],
    ['empty hint', { hint: '' }],
  ])('rejects %s', (_label, patch) => {
    expect(validateWord({ ...base, ...patch }).ok).toBe(false)
  })
})

describe('built-in words', () => {
  it('has ~15 categories of ~20 words', () => {
    expect(BUILTIN_CATEGORIES.length).toBeGreaterThanOrEqual(15)
    for (const category of BUILTIN_CATEGORIES) {
      expect(BUILTIN_WORDS.filter((w) => w.category === category).length, category).toBeGreaterThanOrEqual(20)
    }
  })

  it('every entry passes library validation', () => {
    for (const w of BUILTIN_WORDS) expect(validateWord(w), `${w.category}/${w.word}`).toMatchObject({ ok: true })
  })

  it('has no duplicate words within a category', () => {
    const keys = BUILTIN_WORDS.map((w) => `${w.category}|${w.word}`.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
  })
})
