/**
 * Batches for library games (words, questions). Every add (an MCP call, an
 * admin save, a generation) stamps its rows with one batch number, so the
 * "Recently added" source can play the newest batch first. Each game's table
 * has a nullable `batch INTEGER` column; rows from before batches are NULL.
 *
 * Server-only (node:sqlite); the browser never imports this module.
 */
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'

/**
 * The batch an add joins: `requested` when rows already carry it (a later call
 * of the same request), else one past the newest. Call it inside the add's
 * transaction so two adds can't take the same number.
 */
export function resolveBatch(db: DatabaseSync, table: string, requested?: number | null): number {
  if (requested && db.prepare(`SELECT 1 FROM ${table} WHERE batch = ? LIMIT 1`).get(requested)) return requested
  return (db.prepare(`SELECT COALESCE(MAX(batch), 0) + 1 AS next FROM ${table}`).get() as { next: number }).next
}

/**
 * ORDER BY for "Recently added": least used first, then the newest batch
 * (random within it, so the order isn't the order they were written), then
 * rows from before batches, newest id first.
 */
export function recentOrder(alias: string): string {
  return `${alias}.times_used ASC, ${alias}.batch DESC NULLS LAST, CASE WHEN ${alias}.batch IS NULL THEN ${alias}.id END DESC, random()`
}

/** The newest batch number, optionally within one category id; null when nothing carries one. */
export function newestBatch(db: DatabaseSync, table: string, categoryId?: number | null): number | null {
  const where = categoryId ? 'WHERE category_id = ?' : ''
  const params = categoryId ? [categoryId] : []
  return (db.prepare(`SELECT MAX(batch) AS b FROM ${table} ${where}`).get(...params) as { b: number | null }).b
}

/** Size of the newest batch and how many of it are unplayed, for the lobby. null before any batch. */
export function newestBatchStats(db: DatabaseSync, table: string): { total: number; unused: number } | null {
  const batch = newestBatch(db, table)
  if (batch === null) return null
  return db
    .prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(times_used = 0), 0) AS unused FROM ${table} WHERE batch = ?`)
    .get(batch) as { total: number; unused: number }
}

/** Tool description sentence for MCP add/generate tools. */
export const BATCH_RULE =
  'Each call saves its entries as one batch (returned as `batch`); the lobby\'s "Recently added" setting plays the newest batch first. ' +
  'When one request takes several calls (e.g. one per category), pass the `batch` from the first call to the later ones so they play together.'

/** Input field for MCP add/generate tools. */
export const batchField = z
  .number()
  .int()
  .positive()
  .optional()
  .describe('Join the batch an earlier call of this same request returned; omit it to start a new batch.')
