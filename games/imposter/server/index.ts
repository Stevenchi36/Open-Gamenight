/**
 * The full Imposter module: the pure game (game.ts) plus its I/O integrations,
 * which the core wires up: migrations, prepareRound (word from the library),
 * a public categories route for the lobby, admin routes, and MCP tools.
 */
import { defineGame } from '@wsfg/core/contract'
import express from 'express'
import { BUILTIN_CATEGORIES } from './builtin-words.ts'
import { imposter as game, type ImposterAction, type ImposterState, type PreparedWord } from './game.ts'
import { categoryUsage, countWords, listCategories, pickWord } from './library.ts'
import { adminRouter } from './admin.ts'
import { mcpTools } from './mcp.ts'
import { migrations } from './migrations.ts'
import type { ImposterSettings, ImposterView } from '../shared/index.ts'

export const imposter = defineGame<ImposterState, ImposterAction, ImposterView, ImposterSettings, PreparedWord>({
  ...game,
  migrations,
  mcpTools,
  adminRouter,
  categories: { usage: (services) => categoryUsage(services.db) },

  async prepareRound(request, { settings, services }) {
    const newRound = request.trigger === 'init' || request.action.type === 'next_round'
    if (!newRound || settings.wordSource === 'builtin') return undefined

    const excludeIds = request.trigger === 'action' ? request.state.usedWordIds : []
    const row = pickWord(services.db, { category: settings.category, excludeIds })
    if (row) return { id: row.id, category: row.category, word: row.word, hint: row.hint }

    const notice =
      countWords(services.db) === 0
        ? 'The word library is empty, so built-in words are used.'
        : settings.category
          ? `No unused library words in ${settings.category}, so built-in words are used.`
          : 'Every library word has been used in this room, so built-in words are used.'
    services.logger.info('library fallback', { category: settings.category })
    return { builtin: true, notice }
  },

  publicRouter(services) {
    const router = express.Router()
    router.get('/categories', (_req, res) => {
      res.json({
        // only categories with words are worth picking in the lobby
        library: listCategories(services.db)
          .filter((c) => c.total > 0)
          .map((c) => ({ category: c.category, total: c.total })),
        builtin: BUILTIN_CATEGORIES,
      })
    })
    return router
  },
})

export type { ImposterAction, ImposterState, PreparedWord, SecretWord } from './game.ts'
