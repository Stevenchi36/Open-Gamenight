/**
 * /api/admin/imposter/* (mounted by the core behind requireAdmin + Origin check).
 * Generation returns candidates only; the admin reviews them and saves via POST /words.
 */
import { AiError, type AdminUser, type ServerServices } from '@wsfg/core/contract'
import express, { type Response, type Router } from 'express'
import { z } from 'zod'
import {
  addWords,
  generateWords,
  listCategories,
  listWords,
  LOW_STOCK_THRESHOLD,
  MAX_GENERATE,
  MAX_PAGE_SIZE,
  removeWords,
} from './library.ts'

const difficulty = z.enum(['easy', 'medium', 'hard'])
const listQuery = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
const addBody = z.object({
  words: z
    .array(z.object({ category: z.string(), word: z.string(), hint: z.string(), difficulty: difficulty.optional() }))
    .min(1)
    .max(500),
  /** 'claude' for reviewed AI candidates, 'manual' for hand-typed entries. */
  source: z.enum(['manual', 'claude']).default('manual'),
})
const removeBody = z.object({ ids: z.array(z.number().int()).min(1).max(1000) })
const generateBody = z.object({
  count: z.number().int().min(1).max(MAX_GENERATE),
  category: z.string().trim().max(39).nullish(),
  difficulty: difficulty.nullish(),
})

const AI_STATUS: Record<AiError['code'], number> = { cap: 429, rate_limited: 429, refused: 422, invalid: 502, api: 502 }

function invalid(res: Response, error: z.ZodError) {
  res.status(400).json({ error: 'validation', message: z.prettifyError(error) })
}

export function adminRouter(services: ServerServices): Router {
  const { db, ai } = services
  const router = express.Router()

  router.get('/words', (req, res) => {
    const query = listQuery.safeParse(req.query)
    if (!query.success) return invalid(res, query.error)
    res.json(listWords(db, query.data))
  })

  router.get('/categories', (_req, res) => {
    res.json({
      threshold: LOW_STOCK_THRESHOLD,
      categories: listCategories(db).map((c) => ({ ...c, runningLow: c.unused < LOW_STOCK_THRESHOLD })),
      aiEnabled: !!ai,
    })
  })

  router.post('/words', (req, res) => {
    const body = addBody.safeParse(req.body)
    if (!body.success) return invalid(res, body.error)
    res.json(addWords(db, body.data.words, body.data.source))
  })

  router.delete('/words', (req, res) => {
    const body = removeBody.safeParse(req.body)
    if (!body.success) return invalid(res, body.error)
    res.json({ removed: removeWords(db, body.data.ids) })
  })

  router.post('/words/generate', async (req, res) => {
    if (!ai) {
      res.status(503).json({ error: 'unavailable', message: 'AI generation is not configured (no ANTHROPIC_API_KEY).' })
      return
    }
    const body = generateBody.safeParse(req.body)
    if (!body.success) return invalid(res, body.error)
    const admin = res.locals.user as AdminUser
    try {
      res.json(
        await generateWords(ai, db, {
          count: body.data.count,
          category: body.data.category ?? null,
          difficulty: body.data.difficulty ?? null,
          userId: admin.id,
        }),
      )
    } catch (error) {
      if (!(error instanceof AiError)) throw error
      res.status(AI_STATUS[error.code]).json({ error: error.code, message: error.message })
    }
  })

  return router
}
