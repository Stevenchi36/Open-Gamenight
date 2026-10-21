/**
 * Word library service over imposter_words. Shared by prepareRound, the MCP
 * tools and (later) the admin routes, so every path validates the same way.
 * Synchronous: node:sqlite is synchronous and the queries are tiny.
 */
import type { DatabaseSync } from 'node:sqlite'
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
