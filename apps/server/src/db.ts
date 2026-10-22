/**
 * SQLite via node:sqlite. Two files: auth.db (Better Auth only) and games.db
 * (core tables + every game's prefixed tables). Both use WAL and a busy
 * timeout so the server and the MCP process can share games.db.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { CATEGORIES_MIGRATION } from '@wsfg/core/categories'
import type { AnyGameModule, Logger, Migration } from '@wsfg/core/contract'

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

/**
 * Run fn inside a transaction (a savepoint when already inside one).
 * node:sqlite has no transaction helper; fn must be synchronous.
 */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  const nested = db.isTransaction
  const savepoint = `sp_${Math.random().toString(36).slice(2)}`
  db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT')
    return result
  } catch (error) {
    db.exec(nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : 'ROLLBACK')
    throw error
  }
}

/** Core tables in games.db, applied before any game's. Recorded as `core:<id>`. */
export const CORE_MIGRATIONS: Migration[] = [
  {
    id: '001_ai_usage',
    sql: `
      CREATE TABLE IF NOT EXISTS ai_usage (
        id            INTEGER PRIMARY KEY,
        game_id       TEXT NOT NULL,
        user_id       TEXT,
        model         TEXT NOT NULL,
        input_tokens  INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS ai_usage_created_at ON ai_usage (created_at);
    `,
  },
  CATEGORIES_MIGRATION,
]

const CREATE_TABLE = /create\s+(?:virtual\s+)?table\s+(?:if\s+not\s+exists\s+)?["`[]?(\w+)/gi

/** Throws if a game migration creates a table outside its `<gameId>_` prefix. */
export function assertTablePrefix(gameId: string, migration: Migration): void {
  for (const match of migration.sql.matchAll(CREATE_TABLE)) {
    const table = match[1]!
    if (!table.toLowerCase().startsWith(`${gameId}_`)) {
      throw new Error(`game "${gameId}" migration ${migration.id} creates table "${table}" without the "${gameId}_" prefix`)
    }
  }
}

/** Apply core then game migrations in order, each once, recorded in schema_migrations. */
export function migrateGamesDb(db: DatabaseSync, games: readonly AnyGameModule[], logger?: Logger): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)
  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]).map((r) => r.id),
  )
  const record = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)')
  const ran: string[] = []

  const run = (owner: string, migrations: readonly Migration[]) => {
    for (const migration of migrations) {
      const id = `${owner}:${migration.id}`
      if (applied.has(id)) continue
      if (owner !== 'core') assertTablePrefix(owner, migration)
      transaction(db, () => {
        db.exec(migration.sql)
        record.run(id)
      })
      ran.push(id)
      logger?.info('applied migration', { id })
    }
  }

  run('core', CORE_MIGRATIONS)
  for (const game of games) run(game.id, game.migrations ?? [])
  return ran
}
