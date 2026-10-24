import { describe, expect, it } from 'vitest'
import { validateGuess, validateQuestion } from '../server/validate.ts'

const question = { category: 'Landmarks', question: 'How tall is the Eiffel Tower?', answer: 330, unit: 'm', fact: null }

describe('validateGuess', () => {
  it('accepts finite numbers within ±1e12, folding -0 into 0', () => {
    expect(validateGuess(-3.5)).toEqual({ ok: true, value: -3.5 })
    expect(validateGuess(-0)).toEqual({ ok: true, value: 0 })
    expect(validateGuess(1e13)).toEqual({ ok: false, error: 'That number is too big' })
    expect(validateGuess(Number.NaN)).toEqual({ ok: false, error: 'Enter a number' })
  })
})

describe('validateQuestion', () => {
  it('trims and single-spaces, with an empty fact as null', () => {
    expect(validateQuestion({ ...question, question: '  How  tall is the Eiffel Tower? ', fact: '  ' })).toEqual({
      ok: true,
      value: { ...question, fact: null },
    })
  })

  it('accepts a missing unit and a numeric string answer', () => {
    expect(validateQuestion({ ...question, unit: null, answer: '1889' as never })).toMatchObject({ ok: true, value: { unit: null, answer: 1889 } })
  })

  it('rejects bad questions, answers, units and facts', () => {
    const error = (patch: object) => {
      const result = validateQuestion({ ...question, ...patch })
      return result.ok ? null : result.error
    }
    expect(error({ category: ' ' })).toBe('Category is required')
    expect(error({ question: 'How tall is it' })).toBe('Question must end with "?"')
    expect(error({ question: 'Why?' })).toBe('Question must be at least 5 characters')
    expect(error({ answer: '' })).toBe('Answer is required')
    expect(error({ answer: 'lots' })).toBe('Answer must be a number')
    expect(error({ answer: 2e12 })).toBe('Answer is too big')
    expect(error({ unit: 'ft' })).toBe('Unknown unit "ft"')
    expect(error({ fact: 'x'.repeat(201) })).toBe('Fact must be at most 200 characters')
  })
})
