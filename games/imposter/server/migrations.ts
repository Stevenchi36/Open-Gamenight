import type { Migration } from '@wsfg/core/contract'

/** imposter_* tables in games.db. Never edit an applied migration; add a new one. */
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
]
