/**
 * /api/admin/imposter/* (mounted by the core behind requireAdmin + Origin check).
 * Generation returns candidates only; the admin reviews them and saves via POST /words.
 * With `save: true` it saves directly and returns counts only, so an admin who
 * plays never sees the words.
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
  updateWord,
} from './library.ts'

const difficulty = z.enum(['easy', 'medium', 'hard'])
const listQuery = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
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
const patchBody = z.object({
  categoryId: z.number().int().positive().optional(),
  word: z.string().optional(),
  hint: z.string().optional(),
  difficulty: difficulty.optional(),
})
const generateBody = z.object({
  count: z.number().int().min(1).max(MAX_GENERATE),
  category: z.string().trim().max(39).nullish(),
  difficulty: difficulty.nullish(),
  save: z.boolean().default(false),
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
    res.json(addWords(services, body.data.words, body.data.source))
  })

  router.patch('/words/:id', (req, res) => {
    const body = patchBody.safeParse(req.body)
    if (!body.success) return invalid(res, body.error)
    const result = updateWord(services, Number(req.params.id), body.data)
    if (!result.ok) {
      res.status(result.error.startsWith('No such') ? 404 : 400).json({ error: 'validation', message: result.error })
      return
    }
    res.json(result.value)
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
      const generated = await generateWords(ai, services, {
        count: body.data.count,
        category: body.data.category ?? null,
        difficulty: body.data.difficulty ?? null,
        userId: admin.id,
      })
      if (!body.data.save) {
        res.json(generated)
        return
      }
      // Skipped entries name their words, so only their count goes back.
      const saved = addWords(services, generated.candidates, 'claude')
      res.json({
        inserted: saved.inserted,
        insertedByCategory: saved.insertedByCategory,
        createdCategories: saved.createdCategories,
        skippedCount: generated.skipped.length + saved.skipped.length,
      })
    } catch (error) {
      if (!(error instanceof AiError)) throw error
      res.status(AI_STATUS[error.code]).json({ error: error.code, message: error.message })
    }
  })

  return router
}
