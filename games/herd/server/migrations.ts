import type { Migration } from '@wsfg/core/contract'
import { DEFAULT_QUESTIONS } from './default-questions.ts'

/**
 * herd_* tables in games.db. Never edit an applied migration; add a new one.
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
