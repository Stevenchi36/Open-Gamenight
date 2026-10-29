import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AnyGameModule } from '@ogn/core/contract'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateGamesDb, openDatabase, transaction } from '../src/db.ts'

const dirs: string[] = []
function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'ogn-db-'))
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
    expect(migrateGamesDb(db, games)).toEqual(['core:001_ai_usage', 'core:002_categories', 'core:003_disabled_games', 'demo:001'])
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

  it('moves a renamed game onto its new id without rerunning its migrations', () => {
    const db = tempDb()
    const v1 = { id: 'old', migrations: [{ id: '001', sql: 'CREATE TABLE IF NOT EXISTS old_things (id INTEGER PRIMARY KEY)' }] }
    migrateGamesDb(db, [v1 as unknown as AnyGameModule])
    db.prepare("INSERT INTO categories (game_id, name) VALUES ('old', 'Animals'), ('other', 'Animals')").run()
    db.prepare("INSERT INTO ai_usage (game_id, model, input_tokens, output_tokens) VALUES ('old', 'm', 1, 2)").run()
    db.prepare('INSERT INTO old_things DEFAULT VALUES').run()

    const v2 = {
      id: 'renamed',
      renamedFrom: ['old'],
      migrations: [...v1.migrations, { id: '002_rename', sql: 'ALTER TABLE old_things RENAME TO renamed_things' }],
    } as unknown as AnyGameModule
    expect(migrateGamesDb(db, [v2])).toEqual(['renamed:002_rename'])
    expect(db.prepare("SELECT id FROM schema_migrations WHERE id LIKE '%:0%' AND id NOT LIKE 'core:%' ORDER BY id").all()).toEqual([
      { id: 'renamed:001' },
      { id: 'renamed:002_rename' },
    ])
    expect(db.prepare('SELECT game_id FROM categories ORDER BY game_id').all()).toEqual([{ game_id: 'other' }, { game_id: 'renamed' }])
    expect(db.prepare('SELECT game_id FROM ai_usage').all()).toEqual([{ game_id: 'renamed' }])
    expect(db.prepare('SELECT COUNT(*) AS n FROM renamed_things').get()).toEqual({ n: 1 })
    expect(migrateGamesDb(db, [v2])).toEqual([])
    db.close()
  })

  it('runs a renamed game from scratch on a fresh database, old table names included', () => {
    const db = tempDb()
    const v2 = {
      id: 'renamed',
      renamedFrom: ['old'],
      migrations: [
        { id: '001', sql: 'CREATE TABLE IF NOT EXISTS old_things (id INTEGER PRIMARY KEY)' },
        { id: '002_rename', sql: 'ALTER TABLE old_things RENAME TO renamed_things' },
      ],
    } as unknown as AnyGameModule
    expect(migrateGamesDb(db, [v2])).toEqual(['core:001_ai_usage', 'core:002_categories', 'core:003_disabled_games', 'renamed:001', 'renamed:002_rename'])
    db.prepare('INSERT INTO renamed_things DEFAULT VALUES').run()
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
