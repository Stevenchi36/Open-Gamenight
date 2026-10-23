import type { Migration } from '@wsfg/core/contract'
import { DEFAULT_QUESTIONS } from './default-questions.ts'

/**
 * flock_* tables in games.db. Never edit an applied migration; add a new one.
 * (One exception, in docs/decisions.md: these were squashed after the herd -> flock rename,
 * once every database had applied them, so their ids are unchanged.)
 * Core migrations (including the shared `categories` table) always run first.
 */
export const migrations: Migration[] = [
  {
    id: '001_questions',
    sql: `
      CREATE TABLE IF NOT EXISTS flock_questions (
        id           INTEGER PRIMARY KEY,
        category_id  INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
        question     TEXT NOT NULL,
        source       TEXT NOT NULL DEFAULT 'claude' CHECK (source IN ('claude', 'builtin', 'manual')),
        times_used   INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (category_id, question COLLATE NOCASE)
      );
      CREATE INDEX IF NOT EXISTS flock_questions_category ON flock_questions (category_id, times_used);
    `,
  },
  {
    // Starter library. OR IGNORE: an existing library keeps its own
    // categories (matched ignoring case) and questions, and only gains what's missing.
    id: '002_default_questions',
    sql: seedSql(),
  },
]

function text(s: string): string {
  return `'${s.replaceAll("'", "''")}'`
}

function seedSql(): string {
  const categories = Object.keys(DEFAULT_QUESTIONS).map((name) => `('flock', ${text(name)})`)
  const questions = Object.entries(DEFAULT_QUESTIONS).flatMap(([category, list]) =>
    list.map((question) => `(${text(category)}, ${text(question)})`),
  )
  return `
    INSERT OR IGNORE INTO categories (game_id, name) VALUES ${categories.join(',\n')};
    INSERT OR IGNORE INTO flock_questions (category_id, question, source)
      SELECT c.id, d.column2, 'builtin'
      FROM (VALUES ${questions.join(',\n')}) d
      JOIN categories c ON c.game_id = 'flock' AND c.name = d.column1 COLLATE NOCASE;
  `
}
