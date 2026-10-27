/**
 * The full Ballpark module: the pure game (game.ts) plus its I/O integrations,
 * which the core wires up: migrations, prepareRound (question from the library),
 * a public categories route for the lobby, admin routes, and MCP tools.
 */
import { defineGame } from '@ogn/core/contract'
import { newestBatch, newestBatchStats } from '@ogn/core/library'
import express from 'express'
import { adminRouter } from './admin.ts'
import { DEFAULT_CATEGORIES } from './default-questions.ts'
import { ballpark as game, type BallparkState, type BallparkTimer, type PreparedQuestion } from './game.ts'
import { categoryUsage, countQuestions, pickQuestion, playableCategories, TABLE } from './library.ts'
import { mcpTools } from './mcp.ts'
import { migrations } from './migrations.ts'
import type { BallparkSettings, BallparkView, ClientAction } from '../shared/index.ts'

export const ballpark = defineGame<BallparkState, ClientAction, BallparkTimer, BallparkView, BallparkSettings, PreparedQuestion>({
  ...game,
  migrations,
  mcpTools,
  adminRouter,
  categories: { usage: (services) => categoryUsage(services.db) },

  async prepareRound(request, { settings, services }) {
    const newRound = request.trigger === 'init' || request.action.type === 'next_round' || request.action.type === 'new_game'
    if (!newRound) return undefined

    const excludeIds = request.trigger === 'action' ? request.state.usedQuestionIds : []
    const recent = settings.questionSource === 'recent'
    const row = pickQuestion(services.db, { category: settings.category, excludeIds, recent })
    if (row) {
      const question = { id: row.id, category: row.category, text: row.question, answer: row.answer, unit: row.unit, fact: row.fact }
      if (!recent) return question
      const categoryId = settings.category ? services.categories.findByName(settings.category)?.id : null
      const newest = newestBatch(services.db, TABLE, categoryId)
      if (newest === null || row.batch === newest) return question
      const where = settings.category ? ` in ${settings.category}` : ''
      return { ...question, notice: `The newest added questions${where} have all been played, so older ones are used.` }
    }

    const notice =
      countQuestions(services.db) === 0
        ? 'The question library is empty, so starter questions are used.'
        : settings.category
          ? `No unused questions in ${settings.category}, so starter questions are used.`
          : 'Every library question has been used in this room, so starter questions are used.'
    services.logger.info('library fallback', { category: settings.category })
    return { builtin: true, notice }
  },

  publicRouter(services) {
    const router = express.Router()
    router.get('/categories', (_req, res) => {
      res.json({
        // only categories with questions are worth picking in the lobby
        library: playableCategories(services.db),
        recent: newestBatchStats(services.db, TABLE),
        builtin: DEFAULT_CATEGORIES,
      })
    })
    return router
  },
})

export type { BallparkState, BallparkTimer, PreparedQuestion, Question, StoredQuestion } from './game.ts'
