import type { Migration } from '@ogn/core/contract'
import { DEFAULT_THEMES } from './default-themes.ts'

/**
 * inorder_* tables in games.db. Never edit an applied migration; add a new one.
 * Core migrations (including the shared `categories` table) always run first.
 */
export const migrations: Migration[] = [
  {
    // `batch`: which add each theme came from, for "Recently added" (core library.ts).
    id: '001_themes',
    sql: `
      CREATE TABLE IF NOT EXISTS inorder_themes (
        id           INTEGER PRIMARY KEY,
        category_id  INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
        theme        TEXT NOT NULL,
        low          TEXT NOT NULL,
        high         TEXT NOT NULL,
        source       TEXT NOT NULL DEFAULT 'claude' CHECK (source IN ('claude', 'builtin', 'manual')),
        times_used   INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        batch        INTEGER,
        UNIQUE (category_id, theme COLLATE NOCASE)
      );
      CREATE INDEX IF NOT EXISTS inorder_themes_category ON inorder_themes (category_id, times_used);
      CREATE INDEX IF NOT EXISTS inorder_themes_batch ON inorder_themes (batch);
    `,
  },
  {
    // Starter library. OR IGNORE: an existing library keeps its own
    // categories (matched ignoring case) and themes, and only gains what's missing.
    id: '002_default_themes',
    sql: seedSql(),
  },
]

function text(s: string): string {
  return `'${s.replaceAll("'", "''")}'`
}

function seedSql(): string {
  const categories = Object.keys(DEFAULT_THEMES).map((name) => `('inorder', ${text(name)})`)
  const themes = Object.entries(DEFAULT_THEMES).flatMap(([category, list]) =>
    list.map((t) => `(${text(category)}, ${text(t.theme)}, ${text(t.low)}, ${text(t.high)})`),
  )
  return `
    INSERT OR IGNORE INTO categories (game_id, name) VALUES ${categories.join(',\n')};
    INSERT OR IGNORE INTO inorder_themes (category_id, theme, low, high, source)
      SELECT c.id, d.column2, d.column3, d.column4, 'builtin'
      FROM (VALUES ${themes.join(',\n')}) d
      JOIN categories c ON c.game_id = 'inorder' AND c.name = d.column1 COLLATE NOCASE;
  `
}
