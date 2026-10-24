/** Guess and library question validation. Pure; used by the reducer and the library. */
import { FACT_MAX_LENGTH, MAX_MAGNITUDE, QUESTION_MAX_LENGTH, QUESTION_MIN_LENGTH } from '../shared/index.ts'
import { isUnitCode, type UnitCode } from '../shared/units.ts'

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

export function validateGuess(value: number): Validation<number> {
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter a number' }
  if (Math.abs(value) > MAX_MAGNITUDE) return { ok: false, error: 'That number is too big' }
  // -0 and 0 must land in the same slot
  return { ok: true, value: value === 0 ? 0 : value }
}

export interface QuestionInput {
  category: string
  question: string
  answer: number
  /** A UnitCode, or null for plain numbers (counts, calendar years). */
  unit: string | null
  fact?: string | null
}

export interface ValidQuestion {
  category: string
  question: string
  answer: number
  unit: UnitCode | null
  fact: string | null
}

export const CATEGORY_MAX_LENGTH = 39

const singleSpaced = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ')

/**
 * Library question rules: category 1-39 chars; question 5-160 chars ending in "?";
 * a finite answer within ±1e12; a known unit code or none; an optional fact up to 200 chars.
 */
export function validateQuestion(input: QuestionInput): Validation<ValidQuestion> {
  const category = String(input.category ?? '').trim()
  const question = singleSpaced(input.question)
  const fact = singleSpaced(input.fact) || null
  const unit = input.unit === null || input.unit === undefined || String(input.unit).trim() === '' ? null : String(input.unit).trim()
  const answer = Number(input.answer)
  if (!category) return { ok: false, error: 'Category is required' }
  if (category.length > CATEGORY_MAX_LENGTH) return { ok: false, error: 'Category must be under 40 characters' }
  if (question.length < QUESTION_MIN_LENGTH) return { ok: false, error: `Question must be at least ${QUESTION_MIN_LENGTH} characters` }
  if (question.length > QUESTION_MAX_LENGTH) return { ok: false, error: `Question must be at most ${QUESTION_MAX_LENGTH} characters` }
  if (/\p{Cc}/u.test(question)) return { ok: false, error: 'Question has invalid characters' }
  if (!question.endsWith('?')) return { ok: false, error: 'Question must end with "?"' }
  // Number('') is 0, so an empty form field must be caught before converting.
  const raw: unknown = input.answer
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { ok: false, error: 'Answer is required' }
  if (!Number.isFinite(answer)) return { ok: false, error: 'Answer must be a number' }
  if (Math.abs(answer) > MAX_MAGNITUDE) return { ok: false, error: 'Answer is too big' }
  if (unit !== null && !isUnitCode(unit)) return { ok: false, error: `Unknown unit "${unit}"` }
  if (fact && fact.length > FACT_MAX_LENGTH) return { ok: false, error: `Fact must be at most ${FACT_MAX_LENGTH} characters` }
  if (fact && /\p{Cc}/u.test(fact)) return { ok: false, error: 'Fact has invalid characters' }
  return { ok: true, value: { category, question, answer: answer === 0 ? 0 : answer, unit, fact } }
}
