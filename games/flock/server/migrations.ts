import type { Migration } from '@wsfg/core/contract'
import { DEFAULT_QUESTIONS } from './default-questions.ts'

/**
 * flock_* tables in games.db. Never edit an applied migration; add a new one: 001 and 002
 * still say herd_ and 'herd' because they ran before the game id changed (003 renames them).
 * Core migrations (including the shared `categories` table) always run first.
 */
export const migrations: Migration[] = [
  {
    id: '001_questions',
    sql: `
      CREATE TABLE IF NOT EXISTS herd_questions (
        id           INTEGER PRIMARY KEY,
        category_id  INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
        question     TEXT NOT NULL,
        source       TEXT NOT NULL DEFAULT 'claude' CHECK (source IN ('claude', 'builtin', 'manual')),
        times_used   INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (category_id, question COLLATE NOCASE)
      );
      CREATE INDEX IF NOT EXISTS herd_questions_category ON herd_questions (category_id, times_used);
    `,
  },
  {
    // Starter library. OR IGNORE: an existing library keeps its own
    // categories (matched ignoring case) and questions, and only gains what's missing.
    id: '002_default_questions',
    sql: seedSql(),
  },
  {
    // The game id changed from herd to flock (renamedFrom). The core already moved existing
    // categories; the UPDATE catches the ones 002 just seeded on a fresh database.
    id: '003_rename_from_herd',
    sql: `
      ALTER TABLE herd_questions RENAME TO flock_questions;
      DROP INDEX IF EXISTS herd_questions_category;
      CREATE INDEX IF NOT EXISTS flock_questions_category ON flock_questions (category_id, times_used);
      UPDATE categories SET game_id = 'flock' WHERE game_id = 'herd';
    `,
  },
]

function text(s: string): string {
  return `'${s.replaceAll("'", "''")}'`
}

function seedSql(): string {
  const categories = Object.keys(DEFAULT_QUESTIONS).map((name) => `('herd', ${text(name)})`)
  const questions = Object.entries(DEFAULT_QUESTIONS).flatMap(([category, list]) =>
    list.map((question) => `(${text(category)}, ${text(question)})`),
  )
  return `
    INSERT OR IGNORE INTO categories (game_id, name) VALUES ${categories.join(',\n')};
    INSERT OR IGNORE INTO herd_questions (category_id, question, source)
      SELECT c.id, d.column2, 'builtin'
      FROM (VALUES ${questions.join(',\n')}) d
      JOIN categories c ON c.game_id = 'herd' AND c.name = d.column1 COLLATE NOCASE;
  `
}
