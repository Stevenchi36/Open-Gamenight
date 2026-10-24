/**
 * Word library service over imposter_words (+ the shared categories table).
 * Shared by prepareRound, the MCP tools and the admin routes, so every path
 * validates the same way. Synchronous: node:sqlite is synchronous and the
 * queries are tiny.
 *
 * Categories are referenced by id. Callers that only have a name (MCP, AI
 * generation) go through addWords, which creates missing categories.
 */
import type { DatabaseSync } from 'node:sqlite'
import { AiError, categoryScope, instructionsLine, type AiService, type ServerServices } from '@wsfg/core/contract'
import { z } from 'zod'
import { GAME_ID } from '../shared/index.ts'
import { validateWord, type Validation, type WordInput } from './validate.ts'

export type Difficulty = 'easy' | 'medium' | 'hard'
export type WordSource = 'claude' | 'builtin' | 'manual'

/** What the library functions need from the core. */
export type Library = Pick<ServerServices, 'db' | 'categories'>

export interface WordRow {
  id: number
  category_id: number
  /** Category name (joined). */
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
  id: number
  category: string
  total: number
  unused: number
}

/** Categories with fewer unused words than this are flagged in the admin page. */
export const LOW_STOCK_THRESHOLD = 5
export const MAX_PAGE_SIZE = 200

const FROM = `FROM imposter_words w JOIN categories c ON c.id = w.category_id AND c.game_id = '${GAME_ID}'`
const SELECT_WORD = `SELECT w.id, w.category_id, c.name AS category, w.word, w.hint, w.difficulty, w.source,
  w.times_used, w.last_used_at, w.created_at ${FROM}`

function categoryFilter(where: string[], params: (string | number)[], options: { categoryId?: number | null; category?: string | null }) {
  if (options.categoryId) {
    where.push('w.category_id = ?')
    params.push(options.categoryId)
  } else if (options.category) {
    where.push('c.name = ? COLLATE NOCASE')
    params.push(options.category.trim())
  }
}

export function listWords(
  db: DatabaseSync,
  options: { categoryId?: number | null; category?: string | null; q?: string | null; limit?: number; offset?: number } = {},
): { total: number; words: WordRow[] } {
  const where: string[] = []
  const params: (string | number)[] = []
  categoryFilter(where, params, options)
  if (options.q) {
    where.push("(w.word LIKE ? ESCAPE '\\' OR w.hint LIKE ? ESCAPE '\\')")
    const like = `%${options.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    params.push(like, like)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Math.max(1, options.limit ?? 50), MAX_PAGE_SIZE)
  const offset = Math.max(0, options.offset ?? 0)
  const { total } = db.prepare(`SELECT COUNT(*) AS total ${FROM} ${clause}`).get(...params) as { total: number }
  const words = db
    .prepare(`${SELECT_WORD} ${clause} ORDER BY c.name COLLATE NOCASE, w.word COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as unknown as WordRow[]
  return { total, words }
}

/** Every Imposter category (including empty ones) with total and unused word counts. */
export function listCategories(db: DatabaseSync): CategoryStats[] {
  return db
    .prepare(
      `SELECT c.id, c.name AS category, COUNT(w.id) AS total, COALESCE(SUM(w.times_used = 0), 0) AS unused
       FROM categories c LEFT JOIN imposter_words w ON w.category_id = c.id
       WHERE c.game_id = '${GAME_ID}'
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
    )
    .all() as unknown as CategoryStats[]
}

/** Categories that have words, with total and non-starter counts (for the lobby). */
export function playableCategories(db: DatabaseSync): { category: string; total: number; custom: number }[] {
  return db
    .prepare(
      `SELECT c.name AS category, COUNT(*) AS total, SUM(w.source != 'builtin') AS custom
       FROM categories c JOIN imposter_words w ON w.category_id = c.id
       WHERE c.game_id = '${GAME_ID}'
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
    )
    .all() as { category: string; total: number; custom: number }[]
}

/** Words per category id (for the core Categories admin page). */
export function categoryUsage(db: DatabaseSync): Record<number, number> {
  const rows = db.prepare('SELECT category_id AS id, COUNT(*) AS n FROM imposter_words GROUP BY category_id').all() as {
    id: number
    n: number
  }[]
  return Object.fromEntries(rows.map((r) => [r.id, r.n]))
}

export interface AddResult {
  inserted: number
  skipped: { word: string; category: string; reason: string }[]
  /** Category names that didn't exist and were created. */
  createdCategories: string[]
  /** Inserted count per category (stored spelling). */
  insertedByCategory: Record<string, number>
}

/**
 * Validate, de-dupe (same category + word, case-insensitive) and insert.
 * Duplicates are skipped, not errors. Unknown category names are created.
 */
export function addWords(lib: Library, inputs: WordInput[], source: WordSource = 'manual'): AddResult {
  const { db, categories } = lib
  const insert = db.prepare(
    `INSERT INTO imposter_words (category_id, word, hint, difficulty, source) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  )
  const result: AddResult = { inserted: 0, skipped: [], createdCategories: [], insertedByCategory: {} }
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const input of inputs) {
      const checked = validateWord(input)
      if (!checked.ok) {
        result.skipped.push({ word: String(input.word ?? ''), category: String(input.category ?? ''), reason: checked.error })
        continue
      }
      const { category: name, word, hint, difficulty } = checked.value
      let category = categories.resolve(name)
      if (!category) {
        category = categories.create(name)
        result.createdCategories.push(category.name)
      }
      const { changes } = insert.run(category.id, word, hint, difficulty, source)
      if (changes > 0) {
        result.inserted++
        result.insertedByCategory[category.name] = (result.insertedByCategory[category.name] ?? 0) + 1
      } else result.skipped.push({ word, category: category.name, reason: 'Already in the library' })
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return result
}

export interface WordPatch {
  categoryId?: number
  word?: string
  hint?: string
  difficulty?: Difficulty
}

/** Edit one word (move it to another category, fix the text or hint). Same rules as adding. */
export function updateWord(lib: Library, id: number, patch: WordPatch): Validation<WordRow> {
  const { db, categories } = lib
  const current = db.prepare(`${SELECT_WORD} WHERE w.id = ?`).get(id) as WordRow | undefined
  if (!current) return { ok: false, error: 'No such word' }
  const category = categories.get(patch.categoryId ?? current.category_id)
  if (!category) return { ok: false, error: 'No such category' }
  const checked = validateWord({
    category: category.name,
    word: patch.word ?? current.word,
    hint: patch.hint ?? current.hint,
    difficulty: patch.difficulty ?? current.difficulty,
  })
  if (!checked.ok) return checked
  const clash = db
    .prepare('SELECT 1 FROM imposter_words WHERE category_id = ? AND word = ? COLLATE NOCASE AND id != ?')
    .get(category.id, checked.value.word, id)
  if (clash) return { ok: false, error: `${checked.value.word} is already in ${category.name}` }
  db.prepare('UPDATE imposter_words SET category_id = ?, word = ?, hint = ?, difficulty = ? WHERE id = ?').run(
    category.id,
    checked.value.word,
    checked.value.hint,
    checked.value.difficulty,
    id,
  )
  return { ok: true, value: db.prepare(`${SELECT_WORD} WHERE w.id = ?`).get(id) as unknown as WordRow }
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
 * The least-used word (random among ties), optionally in one category (by
 * name, as stored in room settings), skipping ids already used in this room.
 * `customOnly` skips the seeded starter words. Marks it used. null if nothing matches.
 */
export function pickWord(
  db: DatabaseSync,
  options: { category?: string | null; excludeIds?: number[]; customOnly?: boolean } = {},
): WordRow | null {
  const where: string[] = []
  const params: (string | number)[] = []
  categoryFilter(where, params, { category: options.category ?? null })
  if (options.customOnly) where.push("w.source != 'builtin'")
  const exclude = options.excludeIds ?? []
  if (exclude.length > 0) {
    where.push(`w.id NOT IN (${exclude.map(() => '?').join(',')})`)
    params.push(...exclude)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const row = db.prepare(`${SELECT_WORD} ${clause} ORDER BY w.times_used ASC, random() LIMIT 1`).get(...params) as
    | WordRow
    | undefined
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
  /** Category name; may be new (it's created when the candidates are saved). */
  category?: string | null
  difficulty?: Difficulty | null
  /** Overrides the default one-word hints, e.g. "short phrases". */
  hintStyle?: string | null
  /** Free text from the admin, e.g. "really easy, for young kids". */
  instructions?: string | null
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
- hint: a single, loosely related word (e.g. "Splash" for Water Gun, not "Squirt your friends"). Vague enough not to give the word away, but enough for the imposter to bluff a clue. Never contains the word itself or an obvious form of it.
- difficulty: easy (everyone knows it, many easy clues), medium, or hard (still well known, but trickier to clue).
- No duplicates, and nothing from the avoid list.`

/**
 * Ask the AI service for candidates. They are NOT saved: the admin reviews and
 * saves them (POST /words). Output is validated and de-duplicated against the
 * library; one retry if nothing usable comes back, then an error.
 */
export async function generateWords(
  ai: AiService,
  lib: Library,
  request: GenerateRequest,
): Promise<{ candidates: Candidate[]; skipped: AddResult['skipped'] }> {
  const { db, categories } = lib
  const count = Math.min(Math.max(1, Math.floor(request.count)), MAX_GENERATE)
  const requested = request.category?.trim() || null
  // Use the stored spelling when the category already exists.
  const category = requested ? (categories.resolve(requested)?.name ?? requested) : null
  const avoid = category ? listWords(db, { category, limit: MAX_PAGE_SIZE }).words.map((w) => w.word) : []
  const known = categories.list().map((c) => c.name)

  const prompt = [
    `Write ${count} new entries${categoryScope(category, request.instructions)}.`,
    request.difficulty ? `Difficulty: ${request.difficulty} for all of them.` : 'Mix the difficulties.',
    request.hintStyle?.trim() ? `Hint style (overrides the one-word default): ${request.hintStyle.trim()}` : '',
    instructionsLine(request.instructions),
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
    const result = screenCandidates(lib, output.words, category)
    if (result.candidates.length > 0) {
      return { candidates: result.candidates.slice(0, count), skipped: result.skipped }
    }
    lastError = new AiError('invalid', 'The generated words were all invalid or already in the library.')
  }
  throw lastError ?? new AiError('invalid', 'Generation failed.')
}

/** Validate generated entries, drop ones already in the library or repeated in the batch. */
export function screenCandidates(
  lib: Library,
  entries: WordInput[],
  category: string | null,
): { candidates: Candidate[]; skipped: AddResult['skipped'] } {
  const { db, categories } = lib
  const exists = db.prepare(`SELECT 1 ${FROM} WHERE c.name = ? COLLATE NOCASE AND w.word = ? COLLATE NOCASE`)
  const seen = new Set<string>()
  const candidates: Candidate[] = []
  const skipped: AddResult['skipped'] = []
  for (const entry of entries) {
    const checked = validateWord(category ? { ...entry, category } : entry)
    if (!checked.ok) {
      skipped.push({ word: String(entry.word ?? ''), category: String(entry.category ?? ''), reason: checked.error })
      continue
    }
    const { word } = checked.value
    // Generated names land on the existing category they mean ("Animal" -> "Animals").
    const cat = categories.resolve(checked.value.category)?.name ?? checked.value.category
    const key = `${cat}|${word}`.toLowerCase()
    if (seen.has(key) || exists.get(cat, word)) {
      skipped.push({ word, category: cat, reason: 'Already in the library' })
      continue
    }
    seen.add(key)
    candidates.push({ ...checked.value, category: cat })
  }
  return { candidates, skipped }
}
