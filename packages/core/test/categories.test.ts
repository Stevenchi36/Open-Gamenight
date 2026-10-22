import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { CATEGORIES_MIGRATION, CategoryError, createCategoryService, type CategoryService } from '../src/categories.ts'

let db: DatabaseSync
let mine: CategoryService
let other: CategoryService

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(CATEGORIES_MIGRATION.sql)
  mine = createCategoryService(db, 'mine')
  other = createCategoryService(db, 'other')
})

const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return error instanceof CategoryError ? error.code : String(error)
  }
  return null
}

describe('createCategoryService', () => {
  it('creates, normalizes and lists per game', () => {
    expect(mine.create('  Board   Games ')).toMatchObject({ name: 'Board Games' })
    mine.create('Animals')
    other.create('Animals') // same name, different game: fine
    expect(mine.list().map((c) => c.name)).toEqual(['Animals', 'Board Games'])
    expect(other.list().map((c) => c.name)).toEqual(['Animals'])
  })

  it('rejects duplicates (case-insensitive) and bad names', () => {
    mine.create('Animals')
    expect(code(() => mine.create('ANIMALS'))).toBe('exists')
    expect(code(() => mine.create('   '))).toBe('invalid')
    expect(code(() => mine.create('x'.repeat(40)))).toBe('invalid')
    expect(code(() => mine.create('a\u0000b'))).toBe('invalid')
  })

  it('ensure finds or creates', () => {
    const a = mine.ensure('Animals')
    expect(mine.ensure('animals').id).toBe(a.id)
    expect(mine.list()).toHaveLength(1)
  })

  it('renames, refusing clashes; case-only renames are fine', () => {
    const a = mine.create('Animals')
    mine.create('Food')
    expect(mine.rename(a.id, 'ANIMALS').name).toBe('ANIMALS')
    expect(code(() => mine.rename(a.id, 'food'))).toBe('exists')
    expect(code(() => mine.rename(999, 'X'))).toBe('not_found')
  })

  it("can't see or touch another game's categories", () => {
    const theirs = other.create('Secret')
    expect(mine.get(theirs.id)).toBeNull()
    expect(mine.findByName('Secret')).toBeNull()
    expect(code(() => mine.rename(theirs.id, 'Mine now'))).toBe('not_found')
    expect(code(() => mine.remove(theirs.id))).toBe('not_found')
    expect(other.get(theirs.id)).not.toBeNull()
  })

  it('refuses to delete a referenced category', () => {
    db.exec('CREATE TABLE mine_items (id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT)')
    const a = mine.create('Animals')
    db.prepare('INSERT INTO mine_items (category_id) VALUES (?)').run(a.id)
    expect(code(() => mine.remove(a.id))).toBe('in_use')
    db.exec('DELETE FROM mine_items')
    mine.remove(a.id)
    expect(mine.list()).toEqual([])
  })
})
