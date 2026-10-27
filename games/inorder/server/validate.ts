/** Clue and theme validation. Pure; used by the reducer and the library. */
import { matchKey } from '@ogn/core/categories'
import { CLUE_MAX_LENGTH, END_MAX_LENGTH, THEME_MAX_LENGTH, THEME_MIN_LENGTH } from '../shared/index.ts'

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * A typed clue: trimmed, inner whitespace collapsed, 1-40 chars, and not naming
 * `number` (the clue-giver's own) as a number. Other digits are fine ("101 Dalmatians").
 */
export function validateClue(raw: string, number: number): Validation<string> {
  const text = raw.trim().replace(/\s+/g, ' ')
  if (text.length === 0) return { ok: false, error: 'Enter a clue' }
  if (text.length > CLUE_MAX_LENGTH) return { ok: false, error: `At most ${CLUE_MAX_LENGTH} characters` }
  if (/\p{Cc}/u.test(text)) return { ok: false, error: 'That clue has invalid characters' }
  if (new RegExp(`(^|\\D)0*${number}(\\D|$)`).test(text)) return { ok: false, error: "Don't say your number" }
  return { ok: true, value: text }
}

export interface ThemeInput {
  category: string
  theme: string
  low: string
  high: string
}

export const CATEGORY_MAX_LENGTH = 39

const tidy = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ')

/** Library theme rules: category 1-39 chars, theme 5-80, each end 1-30 and different from the other. */
export function validateTheme(input: ThemeInput): Validation<ThemeInput> {
  const category = String(input.category ?? '').trim()
  const theme = tidy(input.theme)
  const low = tidy(input.low)
  const high = tidy(input.high)
  if (!category) return { ok: false, error: 'Category is required' }
  if (category.length > CATEGORY_MAX_LENGTH) return { ok: false, error: 'Category must be under 40 characters' }
  if (theme.length < THEME_MIN_LENGTH) return { ok: false, error: `Theme must be at least ${THEME_MIN_LENGTH} characters` }
  if (theme.length > THEME_MAX_LENGTH) return { ok: false, error: `Theme must be at most ${THEME_MAX_LENGTH} characters` }
  if (!low || !high) return { ok: false, error: 'Both ends of the scale are required' }
  if (low.length > END_MAX_LENGTH || high.length > END_MAX_LENGTH) return { ok: false, error: `Each end must be at most ${END_MAX_LENGTH} characters` }
  if (matchKey(low) === matchKey(high)) return { ok: false, error: 'The two ends must be different' }
  if (/\p{Cc}/u.test(theme + low + high)) return { ok: false, error: 'Theme has invalid characters' }
  return { ok: true, value: { category, theme, low, high } }
}
