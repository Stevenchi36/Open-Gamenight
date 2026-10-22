import type { Migration } from '@wsfg/core/contract'

/**
 * imposter_* tables in games.db. Never edit an applied migration; add a new one.
 * Core migrations (including the shared `categories` table) always run first.
 */
export const migrations: Migration[] = [
  {
    id: '001_words',
    sql: `
      CREATE TABLE IF NOT EXISTS imposter_words (
        id           INTEGER PRIMARY KEY,
        category     TEXT NOT NULL,
        word         TEXT NOT NULL,
        hint         TEXT NOT NULL,
        difficulty   TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
        source       TEXT NOT NULL DEFAULT 'claude' CHECK (source IN ('claude', 'builtin', 'manual')),
        times_used   INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (category COLLATE NOCASE, word COLLATE NOCASE)
      );
      CREATE INDEX IF NOT EXISTS imposter_words_category ON imposter_words (category COLLATE NOCASE, times_used);
    `,
  },
  {
    // Move categories into the shared core table and reference them by id.
    // Existing words keep their ids, usage counts and dates.
    id: '002_category_ids',
    sql: `
      INSERT OR IGNORE INTO categories (game_id, name)
        SELECT 'imposter', MIN(category) FROM imposter_words GROUP BY category COLLATE NOCASE;

      CREATE TABLE imposter_words_new (
        id           INTEGER PRIMARY KEY,
        category_id  INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
        word         TEXT NOT NULL,
        hint         TEXT NOT NULL,
        difficulty   TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
        source       TEXT NOT NULL DEFAULT 'claude' CHECK (source IN ('claude', 'builtin', 'manual')),
        times_used   INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (category_id, word COLLATE NOCASE)
      );

      INSERT INTO imposter_words_new (id, category_id, word, hint, difficulty, source, times_used, last_used_at, created_at)
        SELECT w.id, c.id, w.word, w.hint, w.difficulty, w.source, w.times_used, w.last_used_at, w.created_at
        FROM imposter_words w
        JOIN categories c ON c.game_id = 'imposter' AND c.name = w.category COLLATE NOCASE;

      DROP TABLE imposter_words;
      ALTER TABLE imposter_words_new RENAME TO imposter_words;
      CREATE INDEX imposter_words_category ON imposter_words (category_id, times_used);
    `,
  },
]
