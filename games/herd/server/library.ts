/**
 * Question library service over herd_questions (+ the shared categories table).
 * Shared by prepareRound, the MCP tools and the admin routes, so every path
 * validates the same way. Synchronous: node:sqlite is synchronous and the
 * queries are tiny.
 *
 * Categories are referenced by id. Callers that only have a name (MCP, AI
 * generation) go through addQuestions, which creates missing categories.
 */
import type { DatabaseSync } from 'node:sqlite'
import { AiError, type AiService, type ServerServices } from '@wsfg/core/contract'
import { z } from 'zod'
import { GAME_ID } from '../shared/index.ts'
import { validateQuestion, type QuestionInput, type Validation } from './validate.ts'

export type QuestionSource = 'claude' | 'builtin' | 'manual'

/** What the library functions need from the core. */
export type Library = Pick<ServerServices, 'db' | 'categories'>

export interface QuestionRow {
  id: number
  category_id: number
  /** Category name (joined). */
  category: string
  question: string
  source: QuestionSource
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

/** Categories with fewer unused questions than this are flagged as running low. */
export const LOW_STOCK_THRESHOLD = 5
export const MAX_PAGE_SIZE = 200

const FROM = `FROM herd_questions q JOIN categories c ON c.id = q.category_id AND c.game_id = '${GAME_ID}'`
const SELECT_QUESTION = `SELECT q.id, q.category_id, c.name AS category, q.question, q.source,
  q.times_used, q.last_used_at, q.created_at ${FROM}`

function categoryFilter(where: string[], params: (string | number)[], options: { categoryId?: number | null; category?: string | null }) {
  if (options.categoryId) {
    where.push('q.category_id = ?')
    params.push(options.categoryId)
  } else if (options.category) {
    where.push('c.name = ? COLLATE NOCASE')
    params.push(options.category.trim())
  }
}

export function listQuestions(
  db: DatabaseSync,
  options: { categoryId?: number | null; category?: string | null; q?: string | null; limit?: number; offset?: number } = {},
): { total: number; questions: QuestionRow[] } {
  const where: string[] = []
  const params: (string | number)[] = []
  categoryFilter(where, params, options)
  if (options.q) {
    where.push("q.question LIKE ? ESCAPE '\\'")
    params.push(`%${options.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Math.max(1, options.limit ?? 50), MAX_PAGE_SIZE)
  const offset = Math.max(0, options.offset ?? 0)
  const { total } = db.prepare(`SELECT COUNT(*) AS total ${FROM} ${clause}`).get(...params) as { total: number }
  const questions = db
    .prepare(`${SELECT_QUESTION} ${clause} ORDER BY c.name COLLATE NOCASE, q.question COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as unknown as QuestionRow[]
  return { total, questions }
}

/** Every Herd category (including empty ones) with total and unused question counts. */
export function listCategories(db: DatabaseSync): CategoryStats[] {
  return db
    .prepare(
      `SELECT c.id, c.name AS category, COUNT(q.id) AS total, COALESCE(SUM(q.times_used = 0), 0) AS unused
       FROM categories c LEFT JOIN herd_questions q ON q.category_id = c.id
       WHERE c.game_id = '${GAME_ID}'
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
    )
    .all() as unknown as CategoryStats[]
}

/** Categories that have questions, with counts (for the lobby). */
export function playableCategories(db: DatabaseSync): { category: string; total: number }[] {
  return db
    .prepare(
      `SELECT c.name AS category, COUNT(*) AS total
       FROM categories c JOIN herd_questions q ON q.category_id = c.id
       WHERE c.game_id = '${GAME_ID}'
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
    )
    .all() as { category: string; total: number }[]
}

/** Questions per category id (for the core Categories admin page). */
export function categoryUsage(db: DatabaseSync): Record<number, number> {
  const rows = db.prepare('SELECT category_id AS id, COUNT(*) AS n FROM herd_questions GROUP BY category_id').all() as {
    id: number
    n: number
  }[]
  return Object.fromEntries(rows.map((r) => [r.id, r.n]))
}

export interface AddResult {
  inserted: number
  skipped: { question: string; category: string; reason: string }[]
  /** Category names that didn't exist and were created. */
  createdCategories: string[]
  /** Inserted count per category (stored spelling). */
  insertedByCategory: Record<string, number>
}

/**
 * Validate, de-dupe (same category + question, case-insensitive) and insert.
 * Duplicates are skipped, not errors. Unknown category names are created.
 */
export function addQuestions(lib: Library, inputs: QuestionInput[], source: QuestionSource = 'manual'): AddResult {
  const { db, categories } = lib
  const insert = db.prepare('INSERT INTO herd_questions (category_id, question, source) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
  const result: AddResult = { inserted: 0, skipped: [], createdCategories: [], insertedByCategory: {} }
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const input of inputs) {
      const checked = validateQuestion(input)
      if (!checked.ok) {
        result.skipped.push({ question: String(input.question ?? ''), category: String(input.category ?? ''), reason: checked.error })
        continue
      }
      const { category: name, question } = checked.value
      let category = categories.findByName(name)
      if (!category) {
        category = categories.create(name)
        result.createdCategories.push(category.name)
      }
      const { changes } = insert.run(category.id, question, source)
      if (changes > 0) {
        result.inserted++
        result.insertedByCategory[category.name] = (result.insertedByCategory[category.name] ?? 0) + 1
      } else result.skipped.push({ question, category: category.name, reason: 'Already in the library' })
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return result
}

/** Edit one question (move it to another category, or fix its text). Same rules as adding. */
export function updateQuestion(lib: Library, id: number, patch: { categoryId?: number; question?: string }): Validation<QuestionRow> {
  const { db, categories } = lib
  const current = db.prepare(`${SELECT_QUESTION} WHERE q.id = ?`).get(id) as QuestionRow | undefined
  if (!current) return { ok: false, error: 'No such question' }
  const category = categories.get(patch.categoryId ?? current.category_id)
  if (!category) return { ok: false, error: 'No such category' }
  const checked = validateQuestion({ category: category.name, question: patch.question ?? current.question })
  if (!checked.ok) return checked
  const clash = db
    .prepare('SELECT 1 FROM herd_questions WHERE category_id = ? AND question = ? COLLATE NOCASE AND id != ?')
    .get(category.id, checked.value.question, id)
  if (clash) return { ok: false, error: `That question is already in ${category.name}` }
  db.prepare('UPDATE herd_questions SET category_id = ?, question = ? WHERE id = ?').run(category.id, checked.value.question, id)
  return { ok: true, value: db.prepare(`${SELECT_QUESTION} WHERE q.id = ?`).get(id) as unknown as QuestionRow }
}

export function removeQuestions(db: DatabaseSync, ids: number[]): number {
  if (ids.length === 0) return 0
  const stmt = db.prepare('DELETE FROM herd_questions WHERE id = ?')
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
 * The least-used question (random among ties), optionally in one category (by
 * name, as stored in room settings), skipping ids already used in this room.
 * Marks it used. null if nothing matches.
 */
export function pickQuestion(db: DatabaseSync, options: { category?: string | null; excludeIds?: number[] } = {}): QuestionRow | null {
  const where: string[] = []
  const params: (string | number)[] = []
  categoryFilter(where, params, { category: options.category ?? null })
  const exclude = options.excludeIds ?? []
  if (exclude.length > 0) {
    where.push(`q.id NOT IN (${exclude.map(() => '?').join(',')})`)
    params.push(...exclude)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const row = db.prepare(`${SELECT_QUESTION} ${clause} ORDER BY q.times_used ASC, random() LIMIT 1`).get(...params) as
    | QuestionRow
    | undefined
  if (!row) return null
  db.prepare("UPDATE herd_questions SET times_used = times_used + 1, last_used_at = datetime('now') WHERE id = ?").run(row.id)
  return { ...row, times_used: row.times_used + 1 }
}

export function countQuestions(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM herd_questions').get() as { n: number }).n
}

// ---------------------------------------------------------------- generation

export const MAX_GENERATE = 50

export interface GenerateRequest {
  count: number
  /** Category name; may be new (it's created when the candidates are saved). */
  category?: string | null
  userId: string | null
}

const generatedSchema = z.object({
  questions: z.array(z.object({ category: z.string(), question: z.string() })),
})

const SYSTEM = `You write questions for Herd Mentality, a party game for families and friends.
Everyone answers the same question in secret, trying to give the answer most other players will give; matching the most popular answer scores.

Rules for each question:
- It has many possible answers, but a few obvious ones most people reach for ("Name a breakfast cereal", "What is the best pizza topping?"). Avoid questions with one correct answer (trivia) or answers nobody would agree on.
- Answers should be a word or a short phrase, so they are easy to type and compare.
- Family friendly, widely known, not tied to one small country or age group.
- 5-120 characters. Phrase it as "Name a..." or a short "What..." question.
- category: short, under 40 characters. Stay inside the requested category when one is given.
- No duplicates, and nothing from the avoid list.`

/**
 * Ask the AI service for candidates. They are NOT saved: the admin reviews and
 * saves them (POST /questions), or the MCP tool saves them directly. Output is
 * validated and de-duplicated against the library; one retry if nothing usable
 * comes back, then an error.
 */
export async function generateQuestions(
  ai: AiService,
  lib: Library,
  request: GenerateRequest,
): Promise<{ candidates: QuestionInput[]; skipped: AddResult['skipped'] }> {
  const { db, categories } = lib
  const count = Math.min(Math.max(1, Math.floor(request.count)), MAX_GENERATE)
  const requested = request.category?.trim() || null
  // Use the stored spelling when the category already exists.
  const category = requested ? (categories.findByName(requested)?.name ?? requested) : null
  const avoid = category ? listQuestions(db, { category, limit: MAX_PAGE_SIZE }).questions.map((q) => q.question) : []
  const known = categories.list().map((c) => c.name)

  const prompt = [
    `Write ${count} new questions${category ? ` in the category "${category}"` : ' across a few fun, varied categories'}.`,
    !category && known.length ? `Existing categories (reuse these names where they fit): ${known.join(', ')}.` : '',
    avoid.length ? `Avoid these questions, already in the library:\n${avoid.join('\n')}` : '',
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
        tool: { name: 'submit_questions', description: 'Submit the generated questions.', inputSchema: generatedSchema },
      })
    } catch (error) {
      if (error instanceof AiError && error.code === 'invalid') {
        lastError = error
        continue // retry once on a malformed response; cap/rate/refusal errors are final
      }
      throw error
    }
    const result = screenCandidates(db, output.questions, category)
    if (result.candidates.length > 0) return { candidates: result.candidates.slice(0, count), skipped: result.skipped }
    lastError = new AiError('invalid', 'The generated questions were all invalid or already in the library.')
  }
  throw lastError ?? new AiError('invalid', 'Generation failed.')
}

/** Validate generated entries, drop ones already in the library or repeated in the batch. */
export function screenCandidates(
  db: DatabaseSync,
  entries: QuestionInput[],
  category: string | null,
): { candidates: QuestionInput[]; skipped: AddResult['skipped'] } {
  const exists = db.prepare(`SELECT 1 ${FROM} WHERE c.name = ? COLLATE NOCASE AND q.question = ? COLLATE NOCASE`)
  const seen = new Set<string>()
  const candidates: QuestionInput[] = []
  const skipped: AddResult['skipped'] = []
  for (const entry of entries) {
    const checked = validateQuestion(category ? { ...entry, category } : entry)
    if (!checked.ok) {
      skipped.push({ question: String(entry.question ?? ''), category: String(entry.category ?? ''), reason: checked.error })
      continue
    }
    const { question, category: cat } = checked.value
    const key = `${cat}|${question}`.toLowerCase()
    if (seen.has(key) || exists.get(cat, question)) {
      skipped.push({ question, category: cat, reason: 'Already in the library' })
      continue
    }
    seen.add(key)
    candidates.push(checked.value)
  }
  return { candidates, skipped }
}
