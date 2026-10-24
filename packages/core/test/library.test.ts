import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { newestBatch, newestBatchStats, recentOrder, resolveBatch } from '../src/library.ts'

let db: DatabaseSync

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, category_id INTEGER, times_used INTEGER NOT NULL DEFAULT 0, batch INTEGER)')
})

const insert = (id: number, batch: number | null, { category = 1, used = 0 } = {}) =>
  db.prepare('INSERT INTO t (id, category_id, times_used, batch) VALUES (?, ?, ?, ?)').run(id, category, used, batch)
const pick = () => (db.prepare(`SELECT id FROM t ORDER BY ${recentOrder('t')} LIMIT 1`).get() as { id: number }).id

describe('resolveBatch', () => {
  it('starts at 1, then one past the newest', () => {
    expect(resolveBatch(db, 't')).toBe(1)
    insert(1, 4)
    expect(resolveBatch(db, 't')).toBe(5)
  })

  it('joins a batch rows already carry, and starts a new one for an unknown number', () => {
    insert(1, 2)
    expect(resolveBatch(db, 't', 2)).toBe(2)
    expect(resolveBatch(db, 't', 9)).toBe(3)
    expect(resolveBatch(db, 't', null)).toBe(3)
  })
})

describe('recentOrder', () => {
  it('plays the newest batch first, then older batches, then unbatched rows by newest id', () => {
    insert(1, null)
    insert(2, null)
    insert(3, 1)
    insert(4, 2)
    const order: number[] = []
    for (let i = 0; i < 4; i++) {
      const id = pick()
      order.push(id)
      db.prepare('UPDATE t SET times_used = 1 WHERE id = ?').run(id)
    }
    expect(order).toEqual([4, 3, 2, 1])
  })

  it('prefers unplayed rows over a played newest batch', () => {
    insert(1, 1)
    insert(2, 2, { used: 1 })
    expect(pick()).toBe(1)
  })

  it('is random within a batch', () => {
    insert(1, 1)
    insert(2, 1)
    insert(3, 1)
    const seen = new Set<number>()
    for (let i = 0; i < 40; i++) seen.add(pick())
    expect(seen.size).toBe(3)
  })
})

describe('newestBatch / newestBatchStats', () => {
  it('finds the newest batch, optionally in one category, and counts it', () => {
    expect(newestBatch(db, 't')).toBeNull()
    expect(newestBatchStats(db, 't')).toBeNull()
    insert(1, null)
    insert(2, 1, { category: 1 })
    insert(3, 2, { category: 2, used: 1 })
    insert(4, 2, { category: 2 })
    expect(newestBatch(db, 't')).toBe(2)
    expect(newestBatch(db, 't', 1)).toBe(1)
    expect(newestBatchStats(db, 't')).toEqual({ total: 2, unused: 1 })
  })
})
