import { describe, expect, it } from 'vitest'
import { normalizeAnswer, validateAnswer, validateQuestion } from '../server/validate.ts'

describe('normalizeAnswer', () => {
  it('ignores case, accents, punctuation and extra spaces', () => {
    expect(normalizeAnswer('  Crème   Brûlée! ')).toBe(normalizeAnswer('creme brulee'))
    expect(normalizeAnswer('Rice-Krispies')).toBe(normalizeAnswer('rice krispies'))
    expect(normalizeAnswer("McDonald's")).toBe(normalizeAnswer('mcdonalds'))
    expect(normalizeAnswer('Fish & Chips')).toBe(normalizeAnswer('fish and chips'))
  })

  it('drops a leading article', () => {
    expect(normalizeAnswer('The Beatles')).toBe(normalizeAnswer('beatles'))
    expect(normalizeAnswer('an apple')).toBe(normalizeAnswer('Apple'))
    expect(normalizeAnswer('The')).toBe('the')
  })

  it('folds a plural s on longer words only', () => {
    expect(normalizeAnswer('Pancakes')).toBe(normalizeAnswer('pancake'))
    expect(normalizeAnswer('Cheerios')).toBe(normalizeAnswer('Cheerio'))
    expect(normalizeAnswer('Corn Flakes')).toBe(normalizeAnswer('corn flake'))
    expect(normalizeAnswer('bus')).toBe('bus')
    expect(normalizeAnswer('glass')).toBe('glass')
    expect(normalizeAnswer('cactus')).toBe('cactus')
    expect(normalizeAnswer('Paris')).toBe('paris')
  })

  it('keeps different answers apart', () => {
    expect(normalizeAnswer('Cheerios')).not.toBe(normalizeAnswer('Shreddies'))
    expect(normalizeAnswer('Coco Pops')).not.toBe(normalizeAnswer('Cocoa Pops'))
  })

  it('still gives punctuation-only answers a key', () => {
    expect(normalizeAnswer('???')).toBe('???')
  })
})

describe('validateAnswer', () => {
  it('trims and collapses spaces', () => {
    expect(validateAnswer('  corn   flakes ')).toEqual({ ok: true, value: 'corn flakes' })
  })

  it('rejects empty, overlong and control characters', () => {
    expect(validateAnswer('   ').ok).toBe(false)
    expect(validateAnswer('x'.repeat(41)).ok).toBe(false)
    expect(validateAnswer('a\u0007b').ok).toBe(false)
  })
})

describe('validateQuestion', () => {
  it('accepts a normal question, tidying spaces', () => {
    expect(validateQuestion({ category: ' Food ', question: 'Name a  cereal' })).toEqual({
      ok: true,
      value: { category: 'Food', question: 'Name a cereal' },
    })
  })

  it('rejects missing category, too short or long questions', () => {
    expect(validateQuestion({ category: '', question: 'Name a cereal' }).ok).toBe(false)
    expect(validateQuestion({ category: 'x'.repeat(40), question: 'Name a cereal' }).ok).toBe(false)
    expect(validateQuestion({ category: 'Food', question: 'Hi?' }).ok).toBe(false)
    expect(validateQuestion({ category: 'Food', question: 'x'.repeat(121) }).ok).toBe(false)
  })
})
