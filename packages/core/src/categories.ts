/**
 * Shared, game-scoped categories (core table `categories`). Games reference
 * them by id (e.g. imposter_words.category_id with ON DELETE RESTRICT), may
 * read/join the table filtered by their own game_id, and create/rename/delete
 * through the CategoryService the core hands them.
 *
 * Server-only (node:sqlite); the browser never imports this module.
 */
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { McpToolDef, Migration } from './contract.ts'

export const CATEGORY_NAME_MAX_LENGTH = 39

/** Core migration; recorded as `core:002_categories`. */
export const CATEGORIES_MIGRATION: Migration = {
  id: '002_categories',
  sql: `
    CREATE TABLE IF NOT EXISTS categories (
      id         INTEGER PRIMARY KEY,
      game_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (game_id, name COLLATE NOCASE)
    );
  `,
}

export interface Category {
  id: number
  name: string
  createdAt: string
}

export type CategoryErrorCode = 'invalid' | 'exists' | 'not_found' | 'in_use'

export class CategoryError extends Error {
  readonly code: CategoryErrorCode
  constructor(code: CategoryErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/** One game's view of the categories table. */
export interface CategoryService {
  list(): Category[]
  get(id: number): Category | null
  /** Case-insensitive. */
  findByName(name: string): Category | null
  /** The category this name means: an exact (case-insensitive) match, else one with the same matchKey ("Sport & Games" for "sports and games"). */
  resolve(name: string): Category | null
  /** Throws 'invalid', or 'exists' when the name resolves to an existing category. */
  create(name: string): Category
  /** Resolve the name, or create it. Throws 'invalid'. */
  ensure(name: string): Category
  /** Throws 'invalid', 'not_found', or 'exists' when the name resolves to another category. */
  rename(id: number, name: string): Category
  /** Throws 'not_found', or 'in_use' when the game still references it. */
  remove(id: number): void
}

/** Trim, collapse inner whitespace, 1-39 characters, no control characters. */
export function normalizeCategoryName(raw: string): string {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!name) throw new CategoryError('invalid', 'Category name is required')
  if (name.length > CATEGORY_NAME_MAX_LENGTH) {
    throw new CategoryError('invalid', `Category name must be under ${CATEGORY_NAME_MAX_LENGTH + 1} characters`)
  }
  if (/\p{Cc}/u.test(name)) throw new CategoryError('invalid', 'Category name has invalid characters')
  return name
}

/**
 * What makes two names the same category, or two library entries (words, questions) in
 * one category the same entry: no case, accents or punctuation, "&" read as "and", no
 * leading "the", and a plural "s" dropped from words of 4+ letters (not -ss/-us/-is).
 * So "Sports & Games", "sport and game" and "Sport and Games!" match, as do "T-Rex" and
 * "t rex". Different wording ("Sport" vs "Athletics") is left to whoever is adding: the
 * MCP tools ask Claude to check list_categories first.
 */
export function matchKey(text: string): string {
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
  if (words.length > 1 && words[0] === 'the') words.shift()
  return words.map((w) => (w.length >= 4 && /[^siu]s$/.test(w) ? w.slice(0, -1) : w)).join(' ')
}

/** The entry of `existing` that means the same as `text` (same matchKey), else null. */
export function findMatch(text: string, existing: string[]): string | null {
  const key = matchKey(text)
  // Text with no letters or digits has an empty key; compare it as written.
  const same = key ? (e: string) => matchKey(e) === key : (e: string) => e.toLowerCase() === text.toLowerCase()
  return existing.find(same) ?? null
}

/** Skip reason for a library entry that findMatch found, naming the stored spelling when it differs. */
export function duplicateReason(text: string, match: string): string {
  return match.toLowerCase() === text.toLowerCase() ? 'Already in the library' : `Already in the library as ${match}`
}

type Row = { id: number; name: string; created_at: string }
const toCategory = (row: Row): Category => ({ id: row.id, name: row.name, createdAt: row.created_at })

/**
 * SQLite reports constraint failures with varying extended codes (ON DELETE
 * RESTRICT comes back as SQLITE_CONSTRAINT_TRIGGER, 1811), so match the
 * primary code SQLITE_CONSTRAINT (19) plus the message.
 */
function isConstraint(error: unknown, kind: 'FOREIGN KEY' | 'UNIQUE'): boolean {
  const e = error as { errcode?: number; message?: string }
  return typeof e.errcode === 'number' && (e.errcode & 0xff) === 19 && !!e.message?.includes(kind)
}

export function createCategoryService(db: DatabaseSync, gameId: string): CategoryService {
  const byId = db.prepare('SELECT id, name, created_at FROM categories WHERE game_id = ? AND id = ?')
  const byName = db.prepare('SELECT id, name, created_at FROM categories WHERE game_id = ? AND name = ? COLLATE NOCASE')
  const all = db.prepare('SELECT id, name, created_at FROM categories WHERE game_id = ? ORDER BY name COLLATE NOCASE')
  const insert = db.prepare('INSERT INTO categories (game_id, name) VALUES (?, ?) RETURNING id, name, created_at')
  const update = db.prepare('UPDATE categories SET name = ? WHERE game_id = ? AND id = ? RETURNING id, name, created_at')
  const del = db.prepare('DELETE FROM categories WHERE game_id = ? AND id = ?')

  const get = (id: number) => {
    const row = byId.get(gameId, id) as Row | undefined
    return row ? toCategory(row) : null
  }
  const findByName = (name: string) => {
    const row = byName.get(gameId, name.trim().replace(/\s+/g, ' ')) as Row | undefined
    return row ? toCategory(row) : null
  }
  const list = () => (all.all(gameId) as Row[]).map(toCategory)
  const resolve = (name: string) => {
    const exact = findByName(name)
    if (exact) return exact
    const key = matchKey(name)
    return key ? (list().find((c) => matchKey(c.name) === key) ?? null) : null
  }
  const clashMessage = (name: string, existing: Category) =>
    existing.name.toLowerCase() === name.toLowerCase()
      ? `There is already a category called ${existing.name}`
      : `${name} is too close to the existing category ${existing.name}`
  const create = (raw: string) => {
    const name = normalizeCategoryName(raw)
    const existing = resolve(name)
    if (existing) throw new CategoryError('exists', clashMessage(name, existing))
    return toCategory(insert.get(gameId, name) as Row)
  }

  return {
    list,
    get,
    findByName,
    resolve,
    create,
    ensure: (raw) => resolve(normalizeCategoryName(raw)) ?? create(raw),
    rename(id, raw) {
      const name = normalizeCategoryName(raw)
      const current = get(id)
      if (!current) throw new CategoryError('not_found', 'No such category')
      // An exact clash wins over a key match, so "Animals" -> "animals" on itself stays a rename.
      const clash = findByName(name) ?? list().find((c) => c.id !== id && matchKey(c.name) === matchKey(name))
      if (clash && clash.id !== id) throw new CategoryError('exists', clashMessage(name, clash))
      try {
        return toCategory(update.get(name, gameId, id) as Row)
      } catch (error) {
        if (isConstraint(error, 'UNIQUE')) {
          throw new CategoryError('exists', `There is already a category called ${name}`)
        }
        throw error
      }
    },
    remove(id) {
      if (!get(id)) throw new CategoryError('not_found', 'No such category')
      try {
        del.run(gameId, id)
      } catch (error) {
        if (isConstraint(error, 'FOREIGN KEY')) {
          throw new CategoryError('in_use', 'This category still has words. Move or delete them first.')
        }
        throw error
      }
    },
  }
}

// ---------------------------------------------------------------- MCP tools

/**
 * For game tools that take category names: check what exists and reuse it, since only
 * spelling differences (matchKey) are matched automatically, not different wording.
 */
export const CATEGORY_REUSE_RULE =
  'Before adding, call list_categories and reuse an existing category whenever one means the same thing, even if worded differently ' +
  '(e.g. use an existing "Sport & Games" rather than a new "Athletics"); only create a new category when nothing fits. ' +
  'Names that differ only in case, punctuation, "&" vs "and" or a plural "s" are matched to the existing category automatically. ' +
  'Categories that still do not exist are created and reported in createdCategories.'

const createSchema = z.object({ name: z.string().describe('Category name, under 40 characters') })
const renameSchema = z.object({
  id: z.number().int().describe('Category id (from list_categories)'),
  name: z.string().describe('New name, under 40 characters'),
})
const deleteSchema = z.object({ id: z.number().int().describe('Category id (from list_categories)') })

/**
 * Category management tools for a game that uses the shared table. The MCP
 * server registers them as `<gameId>_create_category` etc. for every game
 * with a `categories` hook; listing stays the game's own tool (it adds counts).
 */
export function categoryMcpTools(categories: CategoryService): McpToolDef[] {
  return [
    {
      name: 'create_category',
      description: 'Create an empty category. (add_words also creates missing categories, so this is only needed to set one up ahead of time.)',
      inputSchema: createSchema,
      handler: async (args) => categories.create(createSchema.parse(args).name),
    },
    {
      name: 'rename_category',
      description: 'Rename a category. Everything in it stays in it. Fails if another category already has that name.',
      inputSchema: renameSchema,
      handler: async (args) => {
        const { id, name } = renameSchema.parse(args)
        return categories.rename(id, name)
      },
    },
    {
      name: 'delete_category',
      description: 'Delete an empty category. Fails while anything still uses it: move those items to another category or remove them first.',
      inputSchema: deleteSchema,
      handler: async (args) => {
        const { id } = deleteSchema.parse(args)
        const category = categories.get(id)
        categories.remove(id)
        return { deleted: category?.name ?? id }
      },
    },
  ]
}
