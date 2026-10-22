import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AnyGameModule } from '@wsfg/core/contract'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateGamesDb, openDatabase, transaction } from '../src/db.ts'

const dirs: string[] = []
function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'wsfg-db-'))
  dirs.push(dir)
  return openDatabase(join(dir, 'nested', 'games.db'))
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const game = (id: string, sql: string) =>
  ({ id, migrations: [{ id: '001', sql }] }) as unknown as AnyGameModule

describe('openDatabase', () => {
  it('creates parent folders and enables WAL + busy timeout', () => {
    const db = tempDb()
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' })
    expect(db.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: 5000 })
    db.close()
  })
})

describe('migrateGamesDb', () => {
  it('applies core + game migrations once and records them', () => {
    const db = tempDb()
    const games = [game('demo', 'CREATE TABLE IF NOT EXISTS demo_things (id INTEGER PRIMARY KEY)')]
    expect(migrateGamesDb(db, games)).toEqual(['core:001_ai_usage', 'core:002_categories', 'demo:001'])
    expect(migrateGamesDb(db, games)).toEqual([])
    db.prepare('INSERT INTO demo_things DEFAULT VALUES').run()
    db.close()
  })

  it('refuses tables without the game prefix', () => {
    const db = tempDb()
    expect(() => migrateGamesDb(db, [game('demo', 'CREATE TABLE ai_usage_copy (id INTEGER)')])).toThrow(
      /without the "demo_" prefix/,
    )
    expect(() => migrateGamesDb(db, [game('demo', 'create table if not exists "users" (id integer)')])).toThrow(/prefix/)
    db.close()
  })

  it('rolls back a failing migration', () => {
    const db = tempDb()
    const bad = game('demo', 'CREATE TABLE demo_a (id INTEGER); CREATE TABLE demo_a (id INTEGER);')
    expect(() => migrateGamesDb(db, [bad])).toThrow()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'demo_a'").get()).toBeUndefined()
    expect(db.prepare("SELECT id FROM schema_migrations WHERE id = 'demo:001'").get()).toBeUndefined()
    db.close()
  })
})

describe('transaction', () => {
  it('commits, rolls back, and nests with savepoints', () => {
    const db = tempDb()
    db.exec('CREATE TABLE t (n INTEGER)')
    transaction(db, () => db.exec('INSERT INTO t VALUES (1)'))
    expect(() =>
      transaction(db, () => {
        db.exec('INSERT INTO t VALUES (2)')
        throw new Error('boom')
      }),
    ).toThrow('boom')
    transaction(db, () => {
      db.exec('INSERT INTO t VALUES (3)')
      expect(() =>
        transaction(db, () => {
          db.exec('INSERT INTO t VALUES (4)')
          throw new Error('inner')
        }),
      ).toThrow('inner')
    })
    expect(db.prepare('SELECT n FROM t ORDER BY n').all().map((r) => r.n)).toEqual([1, 3])
    db.close()
  })
})
