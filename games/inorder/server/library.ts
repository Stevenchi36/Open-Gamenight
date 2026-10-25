/**
 * Theme library service over inorder_themes (+ the shared categories table).
 * Shared by prepareRound, the MCP tools and the admin routes, so every path
 * validates the same way. Synchronous: node:sqlite is synchronous and the
 * queries are tiny.
 *
 * Categories are referenced by id. Callers that only have a name (MCP, AI
 * generation) go through addThemes, which creates missing categories.
 */
import type { DatabaseSync } from 'node:sqlite'
import { duplicateReason, findMatch, matchKey } from '@wsfg/core/categories'
import { AiError, categoryScope, instructionsLine, type AiService, type ServerServices } from '@wsfg/core/contract'
import { recentOrder, resolveBatch } from '@wsfg/core/library'
import { z } from 'zod'
import { GAME_ID } from '../shared/index.ts'
import { validateTheme, type ThemeInput, type Validation } from './validate.ts'

export type ThemeSource = 'claude' | 'builtin' | 'manual'

/** What the library functions need from the core. */
export type Library = Pick<ServerServices, 'db' | 'categories'>

export interface ThemeRow {
  id: number
  category_id: number
  /** Category name (joined). */
  category: string
  theme: string
  low: string
  high: string
  source: ThemeSource
  times_used: number
  last_used_at: string | null
  created_at: string
  /** Which add it came from (core library.ts). */
  batch: number | null
}

export interface CategoryStats {
  id: number
  category: string
  total: number
  unused: number
}

/** Categories with fewer unused themes than this are flagged as running low. */
export const LOW_STOCK_THRESHOLD = 5
export const MAX_PAGE_SIZE = 200
export const TABLE = 'inorder_themes'

const FROM = `FROM inorder_themes t JOIN categories c ON c.id = t.category_id AND c.game_id = '${GAME_ID}'`
const SELECT_THEME = `SELECT t.id, t.category_id, c.name AS category, t.theme, t.low, t.high, t.source,
  t.times_used, t.last_used_at, t.created_at, t.batch ${FROM}`

function categoryFilter(where: string[], params: (string | number)[], options: { categoryId?: number | null; category?: string | null }) {
  if (options.categoryId) {
    where.push('t.category_id = ?')
    params.push(options.categoryId)
  } else if (options.category) {
    where.push('c.name = ? COLLATE NOCASE')
    params.push(options.category.trim())
  }
}

/** Search matches the theme or either end of its scale. */
export function listThemes(
  db: DatabaseSync,
  options: { categoryId?: number | null; category?: string | null; q?: string | null; limit?: number; offset?: number } = {},
): { total: number; themes: ThemeRow[] } {
  const where: string[] = []
  const params: (string | number)[] = []
  categoryFilter(where, params, options)
  if (options.q) {
    where.push("(t.theme LIKE ? ESCAPE '\\' OR t.low LIKE ? ESCAPE '\\' OR t.high LIKE ? ESCAPE '\\')")
    const like = `%${options.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    params.push(like, like, like)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Math.max(1, options.limit ?? 50), MAX_PAGE_SIZE)
  const offset = Math.max(0, options.offset ?? 0)
  const { total } = db.prepare(`SELECT COUNT(*) AS total ${FROM} ${clause}`).get(...params) as { total: number }
  const themes = db
    .prepare(`${SELECT_THEME} ${clause} ORDER BY c.name COLLATE NOCASE, t.theme COLLATE NOCASE LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as unknown as ThemeRow[]
  return { total, themes }
}

/** Every In Order category (including empty ones) with total and unused theme counts. */
export function listCategories(db: DatabaseSync): CategoryStats[] {
  return db
    .prepare(
      `SELECT c.id, c.name AS category, COUNT(t.id) AS total, COALESCE(SUM(t.times_used = 0), 0) AS unused
       FROM categories c LEFT JOIN inorder_themes t ON t.category_id = c.id
       WHERE c.game_id = '${GAME_ID}'
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
    )
    .all() as unknown as CategoryStats[]
}

/** Categories that have themes, with counts (for the lobby). */
export function playableCategories(db: DatabaseSync): { category: string; total: number }[] {
  return db
    .prepare(
      `SELECT c.name AS category, COUNT(*) AS total
       FROM categories c JOIN inorder_themes t ON t.category_id = c.id
       WHERE c.game_id = '${GAME_ID}'
       GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
    )
    .all() as { category: string; total: number }[]
}

/** Themes per category id (for the core Categories admin page). */
export function categoryUsage(db: DatabaseSync): Record<number, number> {
  const rows = db.prepare('SELECT category_id AS id, COUNT(*) AS n FROM inorder_themes GROUP BY category_id').all() as {
    id: number
    n: number
  }[]
  return Object.fromEntries(rows.map((r) => [r.id, r.n]))
}

export interface AddResult {
  inserted: number
  skipped: { theme: string; category: string; reason: string }[]
  /** Category names that didn't exist and were created. */
  createdCategories: string[]
  /** Inserted count per category (stored spelling). */
  insertedByCategory: Record<string, number>
  /** The batch the inserted themes joined; null when nothing was inserted. */
  batch: number | null
}

/** The theme in this category worded the same as `theme` apart from spelling (core matchKey), else null. */
function similarTheme(db: DatabaseSync, categoryId: number, theme: string, exceptId = 0): string | null {
  const rows = db.prepare('SELECT theme FROM inorder_themes WHERE category_id = ? AND id != ?').all(categoryId, exceptId)
  return findMatch(
    theme,
    (rows as { theme: string }[]).map((r) => r.theme),
  )
}

/**
 * Validate, de-dupe (same category + theme, spelled alike: core matchKey) and insert.
 * Duplicates are skipped, not errors. Unknown category names are created.
 * The themes form a new batch, or join `batch` when themes already carry it.
 */
export function addThemes(lib: Library, inputs: ThemeInput[], source: ThemeSource = 'manual', batch?: number | null): AddResult {
  const { db, categories } = lib
  const insert = db.prepare('INSERT INTO inorder_themes (category_id, theme, low, high, source, batch) VALUES (?, ?, ?, ?, ?, ?)')
  const result: AddResult = { inserted: 0, skipped: [], createdCategories: [], insertedByCategory: {}, batch: null }
  db.exec('BEGIN IMMEDIATE')
  try {
    const stamp = resolveBatch(db, TABLE, batch)
    for (const input of inputs) {
      const checked = validateTheme(input)
      if (!checked.ok) {
        result.skipped.push({ theme: String(input.theme ?? ''), category: String(input.category ?? ''), reason: checked.error })
        continue
      }
      const { category: name, theme, low, high } = checked.value
      let category = categories.resolve(name)
      if (!category) {
        category = categories.create(name)
        result.createdCategories.push(category.name)
      }
      // Earlier inserts in this batch are visible here, so repeats within it are caught too.
      const match = similarTheme(db, category.id, theme)
      if (match !== null) {
        result.skipped.push({ theme, category: category.name, reason: duplicateReason(theme, match) })
        continue
      }
      insert.run(category.id, theme, low, high, source, stamp)
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

export interface ThemePatch {
  categoryId?: number
  theme?: string
  low?: string
  high?: string
}

/** Edit one theme (move it to another category, or fix its text or ends). Same rules as adding. */
export function updateTheme(lib: Library, id: number, patch: ThemePatch): Validation<ThemeRow> {
  const { db, categories } = lib
  const current = db.prepare(`${SELECT_THEME} WHERE t.id = ?`).get(id) as ThemeRow | undefined
  if (!current) return { ok: false, error: 'No such theme' }
  const category = categories.get(patch.categoryId ?? current.category_id)
  if (!category) return { ok: false, error: 'No such category' }
  const checked = validateTheme({
    category: category.name,
    theme: patch.theme ?? current.theme,
    low: patch.low ?? current.low,
    high: patch.high ?? current.high,
  })
  if (!checked.ok) return checked
  const { theme, low, high } = checked.value
  if (similarTheme(db, category.id, theme, id) !== null) return { ok: false, error: `That theme is already in ${category.name}` }
  db.prepare('UPDATE inorder_themes SET category_id = ?, theme = ?, low = ?, high = ? WHERE id = ?').run(category.id, theme, low, high, id)
  return { ok: true, value: db.prepare(`${SELECT_THEME} WHERE t.id = ?`).get(id) as unknown as ThemeRow }
}

export function removeThemes(db: DatabaseSync, ids: number[]): number {
  if (ids.length === 0) return 0
  const stmt = db.prepare('DELETE FROM inorder_themes WHERE id = ?')
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
 * The least-used theme (random among ties), optionally in one category (by
 * name, as stored in room settings), skipping ids already used in this room.
 * `recent` prefers the newest batch among the least used (core recentOrder).
 * Marks it used. null if nothing matches.
 */
export function pickTheme(db: DatabaseSync, options: { category?: string | null; excludeIds?: number[]; recent?: boolean } = {}): ThemeRow | null {
  const where: string[] = []
  const params: (string | number)[] = []
  categoryFilter(where, params, { category: options.category ?? null })
  const exclude = options.excludeIds ?? []
  if (exclude.length > 0) {
    where.push(`t.id NOT IN (${exclude.map(() => '?').join(',')})`)
    params.push(...exclude)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const order = options.recent ? recentOrder('t') : 't.times_used ASC, random()'
  const row = db.prepare(`${SELECT_THEME} ${clause} ORDER BY ${order} LIMIT 1`).get(...params) as ThemeRow | undefined
  if (!row) return null
  db.prepare("UPDATE inorder_themes SET times_used = times_used + 1, last_used_at = datetime('now') WHERE id = ?").run(row.id)
  return { ...row, times_used: row.times_used + 1 }
}

export function countThemes(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM inorder_themes').get() as { n: number }).n
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
  themes: z.array(z.object({ category: z.string(), theme: z.string(), low: z.string(), high: z.string() })),
})

const SYSTEM = `You write themes for In Order, a cooperative party game for families and friends.
Each player gets a secret number from 1 to 100 and names something that fits the theme at that point on its scale (for "How scary is it?", a kitten is low and a shark is high). The team then puts everyone's answers in order.

Rules for each theme:
- theme: a scale everyone can picture, phrased as a short question ("How scary is it?", "How good would it be as a superpower?"). 5-80 characters.
- low and high: what 1 and 100 mean, a few words each ("Not scary at all", "Terrifying"). At most 30 characters, different from each other.
- Many everyday things fit along the scale, people roughly agree where things go but not exactly, and there is room for funny answers. Avoid scales with an exact measurable answer (prices, dates) where the game becomes trivia.
- Family friendly, widely known, not tied to one small country or age group.
- category: short, under 40 characters. Stay inside the requested category when one is given.
- No duplicates, and nothing from the avoid list.`

/**
 * Ask the AI service for candidates. They are NOT saved: the admin reviews and
 * saves them (POST /themes), or the MCP tool saves them directly. Output is
 * validated and de-duplicated against the library; one retry if nothing usable
 * comes back, then an error.
 */
export async function generateThemes(
  ai: AiService,
  lib: Library,
  request: GenerateRequest,
): Promise<{ candidates: ThemeInput[]; skipped: AddResult['skipped'] }> {
  const { db, categories } = lib
  const count = Math.min(Math.max(1, Math.floor(request.count)), MAX_GENERATE)
  const requested = request.category?.trim() || null
  // Use the stored spelling when the category already exists.
  const category = requested ? (categories.resolve(requested)?.name ?? requested) : null
  const avoid = category ? listThemes(db, { category, limit: MAX_PAGE_SIZE }).themes.map((t) => t.theme) : []
  const known = categories.list().map((c) => c.name)

  const prompt = [
    `Write ${count} new themes${categoryScope(category, request.instructions)}.`,
    instructionsLine(request.instructions),
    !category && known.length ? `Existing categories (reuse these names where they fit): ${known.join(', ')}.` : '',
    avoid.length ? `Avoid these themes, already in the library:\n${avoid.join('\n')}` : '',
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
        tool: { name: 'submit_themes', description: 'Submit the generated themes.', inputSchema: generatedSchema },
      })
    } catch (error) {
      if (error instanceof AiError && error.code === 'invalid') {
        lastError = error
        continue // retry once on a malformed response; cap/rate/refusal errors are final
      }
      throw error
    }
    const result = screenCandidates(lib, output.themes, category)
    if (result.candidates.length > 0) return { candidates: result.candidates.slice(0, count), skipped: result.skipped }
    lastError = new AiError('invalid', 'The generated themes were all invalid or already in the library.')
  }
  throw lastError ?? new AiError('invalid', 'Generation failed.')
}

/** Validate generated entries, drop ones already in the library or repeated in the batch. */
export function screenCandidates(
  lib: Library,
  entries: ThemeInput[],
  category: string | null,
): { candidates: ThemeInput[]; skipped: AddResult['skipped'] } {
  const { db, categories } = lib
  const seen = new Set<string>()
  const candidates: ThemeInput[] = []
  const skipped: AddResult['skipped'] = []
  for (const entry of entries) {
    const checked = validateTheme(category ? { ...entry, category } : entry)
    if (!checked.ok) {
      skipped.push({ theme: String(entry.theme ?? ''), category: String(entry.category ?? ''), reason: checked.error })
      continue
    }
    const { theme } = checked.value
    // Generated names land on the existing category they mean ("Animal" -> "Animals").
    const existing = categories.resolve(checked.value.category)
    const cat = existing?.name ?? checked.value.category
    const key = `${matchKey(cat)}|${matchKey(theme) || theme.toLowerCase()}`
    const match = existing ? similarTheme(db, existing.id, theme) : null
    if (seen.has(key) || match !== null) {
      skipped.push({ theme, category: cat, reason: match !== null ? duplicateReason(theme, match) : 'Already in the library' })
      continue
    }
    seen.add(key)
    candidates.push({ ...checked.value, category: cat })
  }
  return { candidates, skipped }
}
