/** Answer and question validation, and answer matching. Pure; used by the reducer and the library. */
import { ANSWER_MAX_LENGTH, QUESTION_MAX_LENGTH, QUESTION_MIN_LENGTH } from '../shared/index.ts'

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

/** A typed answer: trimmed, inner whitespace collapsed, 1-40 chars. */
export function validateAnswer(raw: string): Validation<string> {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (text.length === 0) return { ok: false, error: 'Enter an answer' }
  if (text.length > ANSWER_MAX_LENGTH) return { ok: false, error: `At most ${ANSWER_MAX_LENGTH} characters` }
  if (/\p{Cc}/u.test(text)) return { ok: false, error: 'That answer has invalid characters' }
  return { ok: true, value: text }
}

/**
 * The key answers are grouped by: lower case, no accents or punctuation, single
 * spaces, no leading "the"/"a"/"an", and a plural "s" dropped from words of 4+
 * letters (not -ss/-us/-is, so "glass", "cactus" and "Paris" stay). Anything
 * subtler is the host's call in REVIEW.
 */
export function normalizeAnswer(text: string): string {
  const words = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  if (words.length > 1 && ['the', 'a', 'an'].includes(words[0]!)) words.shift()
  const key = words.map((w) => (w.length >= 4 && /[^siu]s$/.test(w) ? w.slice(0, -1) : w)).join(' ')
  // all punctuation ("???"): fall back to the plain text so it still matches itself
  return key || text.trim().toLowerCase()
}

export interface QuestionInput {
  category: string
  question: string
}

export const CATEGORY_MAX_LENGTH = 39

/** Library question rules: category 1-39 chars, question 5-120 chars, single-spaced. */
export function validateQuestion(input: QuestionInput): Validation<QuestionInput> {
  const category = String(input.category ?? '').trim()
  const question = String(input.question ?? '').trim().replace(/\s+/g, ' ')
  if (!category) return { ok: false, error: 'Category is required' }
  if (category.length > CATEGORY_MAX_LENGTH) return { ok: false, error: 'Category must be under 40 characters' }
  if (question.length < QUESTION_MIN_LENGTH) return { ok: false, error: `Question must be at least ${QUESTION_MIN_LENGTH} characters` }
  if (question.length > QUESTION_MAX_LENGTH) return { ok: false, error: `Question must be at most ${QUESTION_MAX_LENGTH} characters` }
  if (/\p{Cc}/u.test(question)) return { ok: false, error: 'Question has invalid characters' }
  return { ok: true, value: { category, question } }
}
