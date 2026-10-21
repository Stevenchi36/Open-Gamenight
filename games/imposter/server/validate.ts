/** Clue and word-library validation. Pure; used by the reducer, library and builtin list. */
import { CLUE_MAX_LENGTH } from '../shared/index.ts'

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Format rules for a typed clue: trimmed, one token, 1-24 chars.
 * Secret-word and repeat checks happen in the reducer, since they need state
 * (and must not let the imposter probe for the word).
 */
export function validateClueFormat(raw: string): Validation<string> {
  const word = raw.trim()
  if (word.length === 0) return { ok: false, error: 'Enter a clue' }
  if (/\s/.test(word)) return { ok: false, error: 'One word only' }
  if (word.length > CLUE_MAX_LENGTH) return { ok: false, error: `At most ${CLUE_MAX_LENGTH} characters` }
  if (/\p{Cc}/u.test(word)) return { ok: false, error: 'That clue has invalid characters' }
  return { ok: true, value: word }
}

export function isSameWord(a: string, b: string): boolean {
  return same(a, b)
}

export interface WordInput {
  category: string
  word: string
  hint: string
  difficulty?: 'easy' | 'medium' | 'hard'
}

export const WORD_MAX_LENGTH = 29
export const CATEGORY_MAX_LENGTH = 39
export const HINT_MAX_LENGTH = 119

/**
 * Library word rules: word 1-3 words and under 30 chars, category under 40,
 * hint under 120 and must not contain the word (case-insensitive).
 */
export function validateWord(input: WordInput): Validation<Required<WordInput>> {
  const category = input.category.trim()
  const word = input.word.trim().replace(/\s+/g, ' ')
  const hint = input.hint.trim()
  const difficulty = input.difficulty ?? 'medium'

  if (!category) return { ok: false, error: 'Category is required' }
  if (category.length > CATEGORY_MAX_LENGTH) return { ok: false, error: `Category must be under 40 characters` }
  if (!word) return { ok: false, error: 'Word is required' }
  if (word.length > WORD_MAX_LENGTH) return { ok: false, error: 'Word must be under 30 characters' }
  if (word.split(' ').length > 3) return { ok: false, error: 'Word must be at most 3 words' }
  if (!hint) return { ok: false, error: 'Hint is required' }
  if (hint.length > HINT_MAX_LENGTH) return { ok: false, error: 'Hint must be under 120 characters' }
  if (hint.toLowerCase().includes(word.toLowerCase())) return { ok: false, error: 'Hint must not contain the word' }
  if (!['easy', 'medium', 'hard'].includes(difficulty)) return { ok: false, error: 'Unknown difficulty' }
  return { ok: true, value: { category, word, hint, difficulty } }
}
