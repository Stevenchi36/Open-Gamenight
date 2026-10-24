/**
 * Question library service over ballpark_questions (+ the shared categories table).
 * Shared by prepareRound, the MCP tools and the admin routes, so every path
 * validates the same way. Synchronous: node:sqlite is synchronous and the
 * queries are tiny.
 *
 * Categories are referenced by id. Callers that only have a name (MCP, AI
 * generation) go through addQuestions, which creates missing categories.
 */
import type { DatabaseSync } from 'node:sqlite'
import { duplicateReason, findMatch, matchKey } from '@wsfg/core/categories'
import { AiError, categoryScope, instructionsLine, type AiService, type ServerServices } from '@wsfg/core/contract'
import { recentOrder, resolveBatch } from '@wsfg/core/library'
import { z } from 'zod'
import { GAME_ID } from '../shared/index.ts'
import { UNIT_CODES, UNITS, type UnitCode } from '../shared/units.ts'
import { validateQuestion, type QuestionInput, type ValidQuestion, type Validation } from './validate.ts'

export type QuestionSource = 'claude' | 'builtin' | 'manual'

/** What the library functions need from the core. */
export type Library = Pick<ServerServices, 'db' | 'categories'>

export interface QuestionRow {
  id: number
  category_id: number
  /** Category name (joined). */
  category: string
  question: string
  answer: number
  unit: UnitCode | null
  fact: string | null
  source: QuestionSource
  times_used: number
  last_used_at: string | null
  created_at: string
  /** Which add it came from (core library.ts); null for questions from before batches. */
  batch: number | null
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
export const TABLE = 'ballpark_questions'

const FROM = `FROM ballpark_questions q JOIN categories c ON c.id = q.category_id AND c.game_id = '${GAME_ID}'`
const SELECT_QUESTION = `SELECT q.id, q.category_id, c.name AS category, q.question, q.answer, q.unit, q.fact, q.source,
  q.times_used, q.last_used_at, q.created_at, q.batch ${FROM}`

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

/** Every Ballpark category (including empty ones) with total and unused question counts. */
export function listCategories(db: DatabaseSync): CategoryStats[] {
  return db
    .prepare(
      `SELECT c.id, c.name AS category, COUNT(q.id) AS total, COALESCE(SUM(q.times_used = 0), 0) AS unused
       FROM categories c LEFT JOIN ballpark_questions q ON q.category_id = c.id
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
       FROM categories c JOIN ballpark_questions q ON q.category_id = c.id
       WHERE c.game_id = '${GAME_ID}'
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
    )
    .all() as { category: string; total: number }[]
}

/** Questions per category id (for the core Categories admin page). */
export function categoryUsage(db: DatabaseSync): Record<number, number> {
  const rows = db.prepare('SELECT category_id AS id, COUNT(*) AS n FROM ballpark_questions GROUP BY category_id').all() as {
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
  /** The batch the inserted questions joined; null when nothing was inserted. */
  batch: number | null
}

/** The question in this category worded the same as `question` apart from spelling (core matchKey), else null. */
function similarQuestion(db: DatabaseSync, categoryId: number, question: string, exceptId = 0): string | null {
  const rows = db.prepare('SELECT question FROM ballpark_questions WHERE category_id = ? AND id != ?').all(categoryId, exceptId)
  return findMatch(
    question,
    (rows as { question: string }[]).map((r) => r.question),
  )
}

/**
 * Validate, de-dupe (same category + question, spelled alike: core matchKey) and insert.
 * Duplicates are skipped, not errors. Unknown category names are created.
 * The questions form a new batch, or join `batch` when questions already carry it.
 */
export function addQuestions(lib: Library, inputs: QuestionInput[], source: QuestionSource = 'manual', batch?: number | null): AddResult {
  const { db, categories } = lib
  const insert = db.prepare(
    'INSERT INTO ballpark_questions (category_id, question, answer, unit, fact, source, batch) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  const result: AddResult = { inserted: 0, skipped: [], createdCategories: [], insertedByCategory: {}, batch: null }
  db.exec('BEGIN IMMEDIATE')
  try {
    const stamp = resolveBatch(db, TABLE, batch)
    for (const input of inputs) {
      const checked = validateQuestion(input)
      if (!checked.ok) {
        result.skipped.push({ question: String(input.question ?? ''), category: String(input.category ?? ''), reason: checked.error })
        continue
      }
      const { category: name, question, answer, unit, fact } = checked.value
      let category = categories.resolve(name)
      if (!category) {
        category = categories.create(name)
        result.createdCategories.push(category.name)
      }
      // Earlier inserts in this batch are visible here, so repeats within it are caught too.
      const match = similarQuestion(db, category.id, question)
      if (match !== null) {
        result.skipped.push({ question, category: category.name, reason: duplicateReason(question, match) })
        continue
      }
      insert.run(category.id, question, answer, unit, fact, source, stamp)
      result.inserted++
      result.batch = stamp
      result.insertedByCategory[category.name] = (result.insertedByCategory[category.name] ?? 0) + 1
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return result
}

export interface QuestionPatch {
  categoryId?: number
  question?: string
  answer?: number
  unit?: string | null
  fact?: string | null
}

/** Edit one question (move it, or fix its text, answer, unit or fact). Same rules as adding. */
export function updateQuestion(lib: Library, id: number, patch: QuestionPatch): Validation<QuestionRow> {
  const { db, categories } = lib
  const current = db.prepare(`${SELECT_QUESTION} WHERE q.id = ?`).get(id) as QuestionRow | undefined
  if (!current) return { ok: false, error: 'No such question' }
  const category = categories.get(patch.categoryId ?? current.category_id)
  if (!category) return { ok: false, error: 'No such category' }
  const checked = validateQuestion({
    category: category.name,
    question: patch.question ?? current.question,
    answer: patch.answer ?? current.answer,
    unit: patch.unit !== undefined ? patch.unit : current.unit,
    fact: patch.fact !== undefined ? patch.fact : current.fact,
  })
  if (!checked.ok) return checked
  const { question, answer, unit, fact } = checked.value
  if (similarQuestion(db, category.id, question, id) !== null) return { ok: false, error: `That question is already in ${category.name}` }
  db.prepare('UPDATE ballpark_questions SET category_id = ?, question = ?, answer = ?, unit = ?, fact = ? WHERE id = ?').run(
    category.id,
    question,
    answer,
    unit,
    fact,
    id,
  )
  return { ok: true, value: db.prepare(`${SELECT_QUESTION} WHERE q.id = ?`).get(id) as unknown as QuestionRow }
}

export function removeQuestions(db: DatabaseSync, ids: number[]): number {
  if (ids.length === 0) return 0
  const stmt = db.prepare('DELETE FROM ballpark_questions WHERE id = ?')
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
 * `recent` prefers the newest batch among the least used (core recentOrder).
 * Marks it used. null if nothing matches.
 */
export function pickQuestion(
  db: DatabaseSync,
  options: { category?: string | null; excludeIds?: number[]; recent?: boolean } = {},
): QuestionRow | null {
  const where: string[] = []
  const params: (string | number)[] = []
  categoryFilter(where, params, { category: options.category ?? null })
  const exclude = options.excludeIds ?? []
  if (exclude.length > 0) {
    where.push(`q.id NOT IN (${exclude.map(() => '?').join(',')})`)
    params.push(...exclude)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const order = options.recent ? recentOrder('q') : 'q.times_used ASC, random()'
  const row = db.prepare(`${SELECT_QUESTION} ${clause} ORDER BY ${order} LIMIT 1`).get(...params) as
    | QuestionRow
    | undefined
  if (!row) return null
  db.prepare("UPDATE ballpark_questions SET times_used = times_used + 1, last_used_at = datetime('now') WHERE id = ?").run(row.id)
  return { ...row, times_used: row.times_used + 1 }
}

export function countQuestions(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM ballpark_questions').get() as { n: number }).n
}

// ---------------------------------------------------------------- generation

export const MAX_GENERATE = 50

export interface GenerateRequest {
  count: number
  /** Category name; may be new (it's created when the candidates are saved). */
  category?: string | null
  /** Free text from the admin, e.g. "really easy, for young kids". */
  instructions?: string | null
  userId: string | null
}

const generatedSchema = z.object({
  questions: z.array(
    z.object({
      category: z.string(),
      question: z.string(),
      answer: z.number(),
      unit: z.enum(UNIT_CODES as [UnitCode, ...UnitCode[]]).nullable(),
      fact: z.string().nullable(),
    }),
  ),
})

/** One line per unit code, for prompts and tool descriptions. */
export const UNIT_GUIDE = UNIT_CODES.map((code) => `${code} (${UNITS[code].label})`).join(', ')

const SYSTEM = `You write questions for Ballpark, a trivia party game for families and friends.
Everyone guesses a number for the question, then bets on whose guess is closest, so nobody needs to know the answer exactly.

Rules for each question:
- It has one well-documented numeric answer that won't change soon. No populations, prices or records likely to be broken.
- A sensible guess should land in the right ballpark: avoid answers nobody could estimate.
- Family friendly, widely known topics, not tied to one small country.
- 5-160 characters, ending in "?". Never name the unit in the question: the game shows it beside the question and converts it for imperial players. Questions about calendar years or counts have no unit.
- answer: a number in the given unit. Be accurate; double-check every figure.
- unit: one of ${UNIT_CODES.join(', ')}, or null for counts and calendar years. Use metric units (m, km, kg, l, C, km/h...) for measurements; never imperial ones.
- fact: an optional short note shown with the answer (where or when it was measured, a caveat), up to 200 characters, with no measurements in it; null if there's nothing worth adding.
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
): Promise<{ candidates: ValidQuestion[]; skipped: AddResult['skipped'] }> {
  const { db, categories } = lib
  const count = Math.min(Math.max(1, Math.floor(request.count)), MAX_GENERATE)
  const requested = request.category?.trim() || null
  // Use the stored spelling when the category already exists.
  const category = requested ? (categories.resolve(requested)?.name ?? requested) : null
  const avoid = category ? listQuestions(db, { category, limit: MAX_PAGE_SIZE }).questions.map((q) => q.question) : []
  const known = categories.list().map((c) => c.name)

  const prompt = [
    `Write ${count} new questions${categoryScope(category, request.instructions)}.`,
    instructionsLine(request.instructions),
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
    const result = screenCandidates(lib, output.questions, category)
    if (result.candidates.length > 0) return { candidates: result.candidates.slice(0, count), skipped: result.skipped }
    lastError = new AiError('invalid', 'The generated questions were all invalid or already in the library.')
  }
  throw lastError ?? new AiError('invalid', 'Generation failed.')
}

/** Validate generated entries, drop ones already in the library or repeated in the batch. */
export function screenCandidates(
  lib: Library,
  entries: QuestionInput[],
  category: string | null,
): { candidates: ValidQuestion[]; skipped: AddResult['skipped'] } {
  const { db, categories } = lib
  const seen = new Set<string>()
  const candidates: ValidQuestion[] = []
  const skipped: AddResult['skipped'] = []
  for (const entry of entries) {
    const checked = validateQuestion(category ? { ...entry, category } : entry)
    if (!checked.ok) {
      skipped.push({ question: String(entry.question ?? ''), category: String(entry.category ?? ''), reason: checked.error })
      continue
    }
    const { question } = checked.value
    // Generated names land on the existing category they mean ("Animal" -> "Animals").
    const existing = categories.resolve(checked.value.category)
    const cat = existing?.name ?? checked.value.category
    const key = `${matchKey(cat)}|${matchKey(question) || question.toLowerCase()}`
    const match = existing ? similarQuestion(db, existing.id, question) : null
    if (seen.has(key) || match !== null) {
      skipped.push({ question, category: cat, reason: match !== null ? duplicateReason(question, match) : 'Already in the library' })
      continue
    }
    seen.add(key)
    candidates.push({ ...checked.value, category: cat })
  }
  return { candidates, skipped }
}
