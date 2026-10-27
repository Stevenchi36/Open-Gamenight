/**
 * The full In Order module: the pure game (game.ts) plus its I/O integrations,
 * which the core wires up: migrations, prepareRound (theme from the library),
 * a public categories route for the lobby, admin routes, and MCP tools.
 */
import { defineGame } from '@ogn/core/contract'
import { newestBatch, newestBatchStats } from '@ogn/core/library'
import express from 'express'
import { adminRouter } from './admin.ts'
import { DEFAULT_CATEGORIES } from './default-themes.ts'
import { inOrder as game, type InOrderState, type PreparedTheme } from './game.ts'
import { categoryUsage, countThemes, pickTheme, playableCategories, TABLE } from './library.ts'
import { mcpTools } from './mcp.ts'
import { migrations } from './migrations.ts'
import type { ClientAction, InOrderSettings, InOrderView } from '../shared/index.ts'

export const inOrder = defineGame<InOrderState, ClientAction, never, InOrderView, InOrderSettings, PreparedTheme>({
  ...game,
  migrations,
  mcpTools,
  adminRouter,
  categories: { usage: (services) => categoryUsage(services.db) },

  async prepareRound(request, { settings, services }) {
    const newRound = request.trigger === 'init' || (request.trigger === 'action' && (request.action.type === 'next_round' || request.action.type === 'new_game'))
    if (!newRound) return undefined

    const excludeIds = request.trigger === 'action' ? request.state.usedThemeIds : []
    const recent = settings.themeSource === 'recent'
    const row = pickTheme(services.db, { category: settings.category, excludeIds, recent })
    if (row) {
      const theme = { id: row.id, category: row.category, text: row.theme, low: row.low, high: row.high }
      if (!recent) return theme
      const categoryId = settings.category ? services.categories.findByName(settings.category)?.id : null
      const newest = newestBatch(services.db, TABLE, categoryId)
      if (newest === null || row.batch === newest) return theme
      const where = settings.category ? ` in ${settings.category}` : ''
      return { ...theme, notice: `The newest added themes${where} have all been played, so older ones are used.` }
    }

    const notice =
      countThemes(services.db) === 0
        ? 'The theme library is empty, so starter themes are used.'
        : settings.category
          ? `No unused themes in ${settings.category}, so starter themes are used.`
          : 'Every library theme has been used in this room, so starter themes are used.'
    services.logger.info('library fallback', { category: settings.category })
    return { builtin: true, notice }
  },

  publicRouter(services) {
    const router = express.Router()
    router.get('/categories', (_req, res) => {
      res.json({
        // only categories with themes are worth picking in the lobby
        library: playableCategories(services.db),
        recent: newestBatchStats(services.db, TABLE),
        builtin: DEFAULT_CATEGORIES,
      })
    })
    return router
  },
})

export type { InOrderState, PreparedTheme, ThemeRef } from './game.ts'
