import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CATEGORIES_MIGRATION,
  CategoryError,
  createCategoryService,
  duplicateReason,
  findMatch,
  matchKey,
  type CategoryService,
} from '../src/categories.ts'

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

  it('resolves differently spelled names to the existing category', () => {
    const sport = mine.create('Sports & Games')
    const animals = mine.create('Animals')
    for (const name of ['sports & games', 'Sport and Games', 'sport and game!', 'The Sports & Games']) {
      expect(mine.resolve(name)?.id).toBe(sport.id)
    }
    expect(mine.resolve('Animal')?.id).toBe(animals.id)
    expect(mine.resolve('Athletics')).toBeNull()
    expect(mine.ensure('animal').id).toBe(animals.id)
    expect(mine.list()).toHaveLength(2)
  })

  it('refuses to create or rename into a near-duplicate', () => {
    const animals = mine.create('Animals')
    const food = mine.create('Food & Drink')
    expect(code(() => mine.create('Animal'))).toBe('exists')
    expect(() => mine.create('Animal')).toThrow('Animal is too close to the existing category Animals')
    expect(code(() => mine.rename(animals.id, 'Food and Drinks'))).toBe('exists')
    expect(mine.rename(food.id, 'Food and Drink').name).toBe('Food and Drink') // its own key: fine
  })

  it('works out matching keys', () => {
    expect(matchKey('  Crème Brûlée & Cakes ')).toBe('creme brulee and cake')
    expect(matchKey('Glass, Cactus & Paris')).toBe('glass cactus and paris')
    expect(matchKey('The Movies')).toBe('movie')
  })

  it('finds library entries that mean the same, and names them in the skip reason', () => {
    const words = ['Dogs', 'T-Rex', 'Ice Cream', '???']
    expect(findMatch('dog', words)).toBe('Dogs')
    expect(findMatch('t rex', words)).toBe('T-Rex')
    expect(findMatch('ICE-CREAM!', words)).toBe('Ice Cream')
    expect(findMatch('???', words)).toBe('???')
    expect(findMatch('!!!', words)).toBeNull()
    expect(findMatch('Cat', words)).toBeNull()
    expect(duplicateReason('dogs', 'Dogs')).toBe('Already in the library')
    expect(duplicateReason('dog', 'Dogs')).toBe('Already in the library as Dogs')
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
