/**
 * Word library service over imposter_words. Shared by prepareRound, the MCP
 * tools and the admin routes, so every path validates the same way.
 * Synchronous: node:sqlite is synchronous and the queries are tiny.
 */
import type { DatabaseSync } from 'node:sqlite'
import { AiError, type AiService } from '@wsfg/core/contract'
import { z } from 'zod'
import { validateWord, type WordInput } from './validate.ts'

export type Difficulty = 'easy' | 'medium' | 'hard'
export type WordSource = 'claude' | 'builtin' | 'manual'

export interface WordRow {
  id: number
  category: string
  word: string
  hint: string
  difficulty: Difficulty
  source: WordSource
  times_used: number
  last_used_at: string | null
  created_at: string
}

export interface CategoryStats {
  category: string
  total: number
  unused: number
}

/** Categories with fewer unused words than this are flagged in the admin page. */
export const LOW_STOCK_THRESHOLD = 5
export const MAX_PAGE_SIZE = 200

export function listWords(
  db: DatabaseSync,
  options: { category?: string | null; q?: string | null; limit?: number; offset?: number } = {},
): { total: number; words: WordRow[] } {
  const where: string[] = []
  const params: (string | number)[] = []
  if (options.category) {
    where.push('category = ? COLLATE NOCASE')
    params.push(options.category)
  }
  if (options.q) {
    where.push("(word LIKE ? ESCAPE '\\' OR hint LIKE ? ESCAPE '\\')")
    const like = `%${options.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    params.push(like, like)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Math.max(1, options.limit ?? 50), MAX_PAGE_SIZE)
  const offset = Math.max(0, options.offset ?? 0)
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM imposter_words ${clause}`).get(...params) as { total: number }
  const words = db
    .prepare(`SELECT * FROM imposter_words ${clause} ORDER BY category COLLATE NOCASE, word COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as unknown as WordRow[]
  return { total, words }
}

export function listCategories(db: DatabaseSync): CategoryStats[] {
  return db
    .prepare(
      `SELECT category, COUNT(*) AS total, SUM(times_used = 0) AS unused
       FROM imposter_words GROUP BY category COLLATE NOCASE ORDER BY category COLLATE NOCASE`,
    )
    .all() as unknown as CategoryStats[]
}

export interface AddResult {
  inserted: number
  skipped: { word: string; category: string; reason: string }[]
}

/** Validate, de-dupe (same category + word, case-insensitive) and insert. Duplicates are skipped, not errors. */
export function addWords(db: DatabaseSync, inputs: WordInput[], source: WordSource = 'manual'): AddResult {
  const insert = db.prepare(
    `INSERT INTO imposter_words (category, word, hint, difficulty, source) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  )
  const result: AddResult = { inserted: 0, skipped: [] }
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const input of inputs) {
      const checked = validateWord(input)
      if (!checked.ok) {
        result.skipped.push({ word: String(input.word ?? ''), category: String(input.category ?? ''), reason: checked.error })
        continue
      }
      const { category, word, hint, difficulty } = checked.value
      const { changes } = insert.run(category, word, hint, difficulty, source)
      if (changes > 0) result.inserted++
      else result.skipped.push({ word, category, reason: 'Already in the library' })
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return result
}

export function removeWords(db: DatabaseSync, ids: number[]): number {
  if (ids.length === 0) return 0
  const stmt = db.prepare('DELETE FROM imposter_words WHERE id = ?')
  let removed = 0
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const id of ids) removed += Number(stmt.run(id).changes)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return removed
}

/**
 * The least-used word (random among ties), optionally in one category,
 * skipping ids already used in this room. Marks it used. null if nothing matches.
 */
export function pickWord(db: DatabaseSync, options: { category?: string | null; excludeIds?: number[] } = {}): WordRow | null {
  const where: string[] = []
  const params: (string | number)[] = []
  if (options.category) {
    where.push('category = ? COLLATE NOCASE')
    params.push(options.category)
  }
  const exclude = options.excludeIds ?? []
  if (exclude.length > 0) {
    where.push(`id NOT IN (${exclude.map(() => '?').join(',')})`)
    params.push(...exclude)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const row = db
    .prepare(`SELECT * FROM imposter_words ${clause} ORDER BY times_used ASC, random() LIMIT 1`)
    .get(...params) as WordRow | undefined
  if (!row) return null
  db.prepare("UPDATE imposter_words SET times_used = times_used + 1, last_used_at = datetime('now') WHERE id = ?").run(row.id)
  return { ...row, times_used: row.times_used + 1 }
}

export function countWords(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM imposter_words').get() as { n: number }).n
}

// ---------------------------------------------------------------- generation

export const MAX_GENERATE = 50

export interface GenerateRequest {
  count: number
  category?: string | null
  difficulty?: Difficulty | null
  userId: string | null
}

export interface Candidate {
  category: string
  word: string
  hint: string
  difficulty: Difficulty
}

const generatedSchema = z.object({
  words: z.array(
    z.object({
      category: z.string(),
      word: z.string(),
      hint: z.string(),
      difficulty: z.enum(['easy', 'medium', 'hard']),
    }),
  ),
})

const SYSTEM = `You write word lists for Word Imposter, a party game for families and friends.
Everyone except the imposter sees a secret word; the imposter only sees the category and a vague hint, and has to bluff.

Rules for each entry:
- word: a concrete, widely known thing (nouns preferred), 1-3 words, under 30 characters. Family friendly.
- category: short, under 40 characters. Stay inside the requested category when one is given.
- hint: vague enough not to give the word away, but enough for the imposter to bluff a clue. Under 120 characters. Never contains the word itself or an obvious form of it.
- difficulty: easy (everyone knows it, many easy clues), medium, or hard (still well known, but trickier to clue).
- No duplicates, and nothing from the avoid list.`

/**
 * Ask the AI service for candidates. They are NOT saved: the admin reviews and
 * saves them (POST /words). Output is validated and de-duplicated against the
 * library; one retry if nothing usable comes back, then an error.
 */
export async function generateWords(
  ai: AiService,
  db: DatabaseSync,
  request: GenerateRequest,
): Promise<{ candidates: Candidate[]; skipped: AddResult['skipped'] }> {
  const count = Math.min(Math.max(1, Math.floor(request.count)), MAX_GENERATE)
  const category = request.category?.trim() || null
  const avoid = category
    ? listWords(db, { category, limit: MAX_PAGE_SIZE }).words.map((w) => w.word)
    : []
  const known = listCategories(db).map((c) => c.category)

  const prompt = [
    `Write ${count} new entries${category ? ` in the category "${category}"` : ' across a few fun, varied categories'}.`,
    request.difficulty ? `Difficulty: ${request.difficulty} for all of them.` : 'Mix the difficulties.',
    !category && known.length ? `Existing categories (reuse these names where they fit): ${known.join(', ')}.` : '',
    avoid.length ? `Avoid these words, already in the library: ${avoid.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n')

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    let output: z.infer<typeof generatedSchema>
    try {
      output = await ai.generate({
        userId: request.userId,
        system: SYSTEM,
        prompt,
        tool: { name: 'submit_words', description: 'Submit the generated word entries.', inputSchema: generatedSchema },
      })
    } catch (error) {
      if (error instanceof AiError && error.code === 'invalid') {
        lastError = error
        continue // retry once on a malformed response; cap/rate/refusal errors are final
      }
      throw error
    }
    const result = screenCandidates(db, output.words, category)
    if (result.candidates.length > 0) {
      return { candidates: result.candidates.slice(0, count), skipped: result.skipped }
    }
    lastError = new AiError('invalid', 'The generated words were all invalid or already in the library.')
  }
  throw lastError ?? new AiError('invalid', 'Generation failed.')
}

/** Validate generated entries, drop ones already in the library or repeated in the batch. */
export function screenCandidates(
  db: DatabaseSync,
  entries: WordInput[],
  category: string | null,
): { candidates: Candidate[]; skipped: AddResult['skipped'] } {
  const exists = db.prepare('SELECT 1 FROM imposter_words WHERE category = ? COLLATE NOCASE AND word = ? COLLATE NOCASE')
  const seen = new Set<string>()
  const candidates: Candidate[] = []
  const skipped: AddResult['skipped'] = []
  for (const entry of entries) {
    const checked = validateWord(category ? { ...entry, category } : entry)
    if (!checked.ok) {
      skipped.push({ word: String(entry.word ?? ''), category: String(entry.category ?? ''), reason: checked.error })
      continue
    }
    const { word, category: cat } = checked.value
    const key = `${cat}|${word}`.toLowerCase()
    if (seen.has(key) || exists.get(cat, word)) {
      skipped.push({ word, category: cat, reason: 'Already in the library' })
      continue
    }
    seen.add(key)
    candidates.push(checked.value)
  }
  return { candidates, skipped }
}
