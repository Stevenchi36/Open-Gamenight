/**
 * /api/admin/flock/* (mounted by the core behind requireAdmin + Origin check).
 * Generation returns candidates only; the admin reviews them and saves via POST /questions.
 */
import { AI_INSTRUCTIONS_MAX_LENGTH, AiError, type AdminUser, type ServerServices } from '@wsfg/core/contract'
import { removeUsed } from '@wsfg/core/library'
import express, { type Response, type Router } from 'express'
import { z } from 'zod'
import {
  addQuestions,
  generateQuestions,
  listCategories,
  listQuestions,
  LOW_STOCK_THRESHOLD,
  MAX_GENERATE,
  MAX_PAGE_SIZE,
  removeQuestions,
  TABLE,
  updateQuestion,
} from './library.ts'

const listQuery = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  category: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
const addBody = z.object({
  questions: z.array(z.object({ category: z.string(), question: z.string() })).min(1).max(500),
  /** 'claude' for reviewed AI candidates, 'manual' for hand-typed entries. */
  source: z.enum(['manual', 'claude']).default('manual'),
})
const removeBody = z.object({ ids: z.array(z.number().int()).min(1).max(1000) })
/** No category: clear used entries in every category. */
const clearUsedBody = z.object({ categoryId: z.number().int().positive().nullish() })
const patchBody = z.object({
  categoryId: z.number().int().positive().optional(),
  question: z.string().optional(),
})
const generateBody = z.object({
  count: z.number().int().min(1).max(MAX_GENERATE),
  category: z.string().trim().max(39).nullish(),
  instructions: z.string().max(AI_INSTRUCTIONS_MAX_LENGTH).nullish(),
})

const AI_STATUS: Record<AiError['code'], number> = { cap: 429, rate_limited: 429, refused: 422, invalid: 502, api: 502 }

function invalid(res: Response, error: z.ZodError) {
  res.status(400).json({ error: 'validation', message: z.prettifyError(error) })
}

export function adminRouter(services: ServerServices): Router {
  const { db, ai } = services
  const router = express.Router()

  router.get('/questions', (req, res) => {
    const query = listQuery.safeParse(req.query)
    if (!query.success) return invalid(res, query.error)
    res.json(listQuestions(db, query.data))
  })

  router.get('/categories', (_req, res) => {
    res.json({
      threshold: LOW_STOCK_THRESHOLD,
      categories: listCategories(db).map((c) => ({ ...c, runningLow: c.unused < LOW_STOCK_THRESHOLD })),
      aiEnabled: !!ai,
    })
  })

  router.post('/questions', (req, res) => {
    const body = addBody.safeParse(req.body)
    if (!body.success) return invalid(res, body.error)
    res.json(addQuestions(services, body.data.questions, body.data.source))
  })

  router.patch('/questions/:id', (req, res) => {
    const body = patchBody.safeParse(req.body)
    if (!body.success) return invalid(res, body.error)
    const result = updateQuestion(services, Number(req.params.id), body.data)
    if (!result.ok) {
      res.status(result.error.startsWith('No such') ? 404 : 400).json({ error: 'validation', message: result.error })
      return
    }
    res.json(result.value)
  })

  router.delete('/questions', (req, res) => {
    const body = removeBody.safeParse(req.body)
    if (!body.success) return invalid(res, body.error)
    res.json({ removed: removeQuestions(db, body.data.ids) })
  })

  router.delete('/questions/used', (req, res) => {
    const body = clearUsedBody.safeParse(req.body ?? {})
    if (!body.success) return invalid(res, body.error)
    res.json({ removed: removeUsed(db, TABLE, body.data.categoryId) })
  })

  router.post('/questions/generate', async (req, res) => {
    if (!ai) {
      res.status(503).json({ error: 'unavailable', message: 'AI generation is not configured (no ANTHROPIC_API_KEY).' })
      return
    }
    const body = generateBody.safeParse(req.body)
    if (!body.success) return invalid(res, body.error)
    const admin = res.locals.user as AdminUser
    try {
      const { count, category, instructions } = body.data
      res.json(await generateQuestions(ai, services, { count, category: category ?? null, instructions: instructions ?? null, userId: admin.id }))
    } catch (error) {
      if (!(error instanceof AiError)) throw error
      res.status(AI_STATUS[error.code]).json({ error: error.code, message: error.message })
    }
  })

  return router
}
