/**
 * The full Imposter module: the pure game (game.ts) plus its I/O integrations,
 * which the core wires up: migrations, prepareRound (word from the library),
 * a public categories route for the lobby, admin routes, and MCP tools.
 */
import { defineGame } from '@ogn/core/contract'
import { newestBatch, newestBatchStats } from '@ogn/core/library'
import express from 'express'
import { BUILTIN_CATEGORIES } from './builtin-words.ts'
import { imposter as game, type ImposterState, type ImposterTimer, type PreparedWord } from './game.ts'
import { categoryUsage, countWords, pickWord, playableCategories, TABLE } from './library.ts'
import { adminRouter } from './admin.ts'
import { mcpTools } from './mcp.ts'
import { migrations } from './migrations.ts'
import type { ClientAction, ImposterSettings, ImposterView } from '../shared/index.ts'

export const imposter = defineGame<ImposterState, ClientAction, ImposterTimer, ImposterView, ImposterSettings, PreparedWord>({
  ...game,
  migrations,
  mcpTools,
  adminRouter,
  categories: { usage: (services) => categoryUsage(services.db) },

  async prepareRound(request, { settings, services }) {
    const newRound = request.trigger === 'init' || request.action.type === 'next_round'
    if (!newRound) return undefined

    const excludeIds = request.trigger === 'action' ? request.state.usedWordIds : []
    const pick = { category: settings.category, excludeIds }
    if (settings.wordSource === 'recent') {
      const row = pickWord(services.db, { ...pick, recent: true })
      if (row) {
        const word = { id: row.id, category: row.category, word: row.word, hint: row.hint }
        const categoryId = settings.category ? services.categories.findByName(settings.category)?.id : null
        const newest = newestBatch(services.db, TABLE, categoryId)
        if (newest === null || row.batch === newest) return word
        const where = settings.category ? ` in ${settings.category}` : ''
        return { ...word, notice: `The newest added words${where} have all been played, so older ones are used.` }
      }
    } else if (settings.wordSource === 'custom') {
      const row = pickWord(services.db, { ...pick, customOnly: true })
      if (row) return { id: row.id, category: row.category, word: row.word, hint: row.hint }
    }
    const row = pickWord(services.db, pick)
    if (row) {
      const word = { id: row.id, category: row.category, word: row.word, hint: row.hint }
      if (settings.wordSource !== 'custom') return word
      const where = settings.category ? ` in ${settings.category}` : ''
      return { ...word, notice: `No unused added words${where}, so built-in words are used.` }
    }

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
        library: playableCategories(services.db),
        recent: newestBatchStats(services.db, TABLE),
        builtin: BUILTIN_CATEGORIES,
      })
    })
    return router
  },
})

export type { ImposterState, ImposterTimer, PreparedWord, SecretWord } from './game.ts'
