import type { Migration } from '@ogn/core/contract'
import { DEFAULT_QUESTION_LIST, DEFAULT_QUESTIONS } from './default-questions.ts'

/**
 * ballpark_* tables in games.db. Never edit an applied migration; add a new one.
 * Core migrations (including the shared `categories` table) always run first.
 */
export const migrations: Migration[] = [
  {
    id: '001_questions',
    sql: `
      CREATE TABLE IF NOT EXISTS ballpark_questions (
        id           INTEGER PRIMARY KEY,
        category_id  INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
        question     TEXT NOT NULL,
        answer       REAL NOT NULL,
        unit         TEXT,
        fact         TEXT,
        source       TEXT NOT NULL DEFAULT 'claude' CHECK (source IN ('claude', 'builtin', 'manual')),
        times_used   INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (category_id, question COLLATE NOCASE)
      );
      CREATE INDEX IF NOT EXISTS ballpark_questions_category ON ballpark_questions (category_id, times_used);
    `,
  },
  {
    // Starter library. OR IGNORE: an existing library keeps its own
    // categories (matched ignoring case) and questions, and only gains what's missing.
    id: '002_default_questions',
    sql: seedSql(),
  },
  {
    // Which add each question came from, for "Recently added" (core library.ts).
    // Existing questions stay NULL and play after every batch.
    id: '003_batches',
    sql: `
      ALTER TABLE ballpark_questions ADD COLUMN batch INTEGER;
      CREATE INDEX ballpark_questions_batch ON ballpark_questions (batch);
    `,
  },
]

function text(s: string | null): string {
  return s === null ? 'NULL' : `'${s.replaceAll("'", "''")}'`
}

function seedSql(): string {
  const categories = Object.keys(DEFAULT_QUESTIONS).map((name) => `('ballpark', ${text(name)})`)
  const questions = DEFAULT_QUESTION_LIST.map(
    (q) => `(${text(q.category)}, ${text(q.question)}, ${q.answer}, ${text(q.unit)}, ${text(q.fact)})`,
  )
  return `
    INSERT OR IGNORE INTO categories (game_id, name) VALUES ${categories.join(',\n')};
    INSERT OR IGNORE INTO ballpark_questions (category_id, question, answer, unit, fact, source)
      SELECT c.id, d.column2, d.column3, d.column4, d.column5, 'builtin'
      FROM (VALUES ${questions.join(',\n')}) d
      JOIN categories c ON c.game_id = 'ballpark' AND c.name = d.column1 COLLATE NOCASE;
  `
}
