/**
 * The full Herd Mentality module: the pure game (game.ts) plus its I/O integrations,
 * which the core wires up: migrations, prepareRound (question from the library),
 * a public categories route for the lobby, admin routes, and MCP tools.
 */
import { defineGame } from '@wsfg/core/contract'
import express from 'express'
import { adminRouter } from './admin.ts'
import { DEFAULT_CATEGORIES } from './default-questions.ts'
import { herd as game, type HerdState, type HerdTimer, type PreparedQuestion } from './game.ts'
import { categoryUsage, countQuestions, pickQuestion, playableCategories } from './library.ts'
import { mcpTools } from './mcp.ts'
import { migrations } from './migrations.ts'
import type { ClientAction, HerdSettings, HerdView } from '../shared/index.ts'

export const herd = defineGame<HerdState, ClientAction, HerdTimer, HerdView, HerdSettings, PreparedQuestion>({
  ...game,
  migrations,
  mcpTools,
  adminRouter,
  categories: { usage: (services) => categoryUsage(services.db) },

  async prepareRound(request, { settings, services }) {
    const newRound = request.trigger === 'init' || request.action.type === 'next_round' || request.action.type === 'new_game'
    if (!newRound) return undefined

    const excludeIds = request.trigger === 'action' ? request.state.usedQuestionIds : []
    const row = pickQuestion(services.db, { category: settings.category, excludeIds })
    if (row) return { id: row.id, category: row.category, text: row.question }

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
        builtin: DEFAULT_CATEGORIES,
      })
    })
    return router
  },
})

export type { HerdState, HerdTimer, PreparedQuestion, Question } from './game.ts'
