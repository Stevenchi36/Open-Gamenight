/**
 * /api/admin: core admin routes plus each game's adminRouter at
 * /api/admin/<gameId>. The Origin check and requireAdmin run before any game
 * code, and a game router only ever sees paths under its own prefix.
 * User management itself goes through Better Auth's admin endpoints
 * (/api/auth/admin/*), which enforce the admin role on their own.
 */
import { CategoryError } from '@ogn/core/categories'
import type { AnyGameModule, ServerServices } from '@ogn/core/contract'
import express, { type Router } from 'express'
import { z } from 'zod'
import type { AiCore } from '../ai.ts'
import type { Auth } from '../auth.ts'
import { CHAT_MESSAGE_MAX_LENGTH, type AdminChat } from '../chat.ts'
import type { Config } from '../config.ts'
import { GameAvailabilityError, type GameAvailability } from '../game-availability.ts'
import { originCheck, rateLimit, RateLimiter, requireAdmin, sessionUser } from '../middleware.ts'
import type { RoomManager } from '../rooms.ts'
import type { UpdateChecker } from '../updates.ts'

export type AdminRooms = Pick<RoomManager, 'list' | 'close'>

export interface AdminRouterDeps {
  config: Config
  auth: Auth
  games: readonly AnyGameModule[]
  availability: GameAvailability
  ai: AiCore | null
  rooms: AdminRooms
  servicesFor: (game: AnyGameModule) => ServerServices
  /** The Assistant; null without AI. */
  chat: AdminChat | null
  updates: UpdateChecker
}

const chatBody = z.object({
  conversationId: z.string().max(100).nullish(),
  message: z.string().trim().min(1, 'Type a message').max(CHAT_MESSAGE_MAX_LENGTH, `Keep it under ${CHAT_MESSAGE_MAX_LENGTH} characters`),
})

const gameToggleBody = z.object({ enabled: z.boolean() })

export function createAdminRouter({ config, auth, games, availability, ai, rooms, servicesFor, chat, updates }: AdminRouterDeps): Router {
  const router = express.Router()
  router.use(originCheck(config))
  router.use(requireAdmin(auth))
  router.use(rateLimit(new RateLimiter({ windowMs: 60_000, max: 300 }), (_req, res) => sessionUser(res).id))
  router.use(express.json({ limit: '256kb' }))

  router.get('/status', (_req, res) => {
    res.json({
      games: games.map((g) => ({ id: g.id, name: g.name, hasAdmin: !!g.adminRouter, hasCategories: !!g.categories })),
      aiEnabled: !!ai,
    })
  })

  /** Today's AI spend against the daily output-token cap. */
  router.get('/ai/usage', (_req, res) => {
    res.json(ai ? { enabled: true, ...ai.usageToday() } : { enabled: false })
  })

  /** Every registered game and whether players can pick it, alphabetical like the game menus. */
  router.get('/games', (_req, res) => {
    res.json({
      games: [...games]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((g) => ({ id: g.id, name: g.name, description: g.description, enabled: availability.isEnabled(g.id) })),
    })
  })
  /** Turn a game on or off for new rooms and the lobby switcher. Rooms already on it keep playing. */
  router.put('/games/:gameId', (req, res) => {
    const body = gameToggleBody.safeParse(req.body)
    if (!body.success) {
      res.status(400).json({ error: 'validation', message: 'Send { enabled: true | false }' })
      return
    }
    try {
      availability.set(req.params.gameId, body.data.enabled)
    } catch (error) {
      if (!(error instanceof GameAvailabilityError)) throw error
      res.status(error.code === 'not_found' ? 404 : 409).json({ error: error.code, message: error.message })
      return
    }
    res.json({ id: req.params.gameId, enabled: body.data.enabled })
  })

  /** Running version and whether upstream has newer commits; open rooms, since updating ends them. */
  router.get('/updates', async (req, res) => {
    const status = await updates.status({ refresh: req.query.refresh === '1' })
    res.json({ ...status, openRooms: rooms.list().length })
  })

  /** Open rooms. Joining one is the normal join flow; closing sends everyone out. */
  router.get('/rooms', (_req, res) => {
    res.json({ rooms: rooms.list() })
  })
  router.post('/rooms/:code/close', async (req, res) => {
    if (!(await rooms.close(req.params.code))) {
      res.status(404).json({ error: 'not_found', message: 'That room has already closed' })
      return
    }
    res.json({ closed: true })
  })

  /**
   * The Assistant: one admin message in, then progress as NDJSON (ChatEvent per line) while
   * Claude works through the tools, ending with `done`. Streamed so long turns don't hit
   * proxy timeouts and the page can show each step.
   */
  router.post('/chat', async (req, res) => {
    if (!chat) {
      res.status(404).json({ error: 'not_found', message: 'The Assistant needs ANTHROPIC_API_KEY' })
      return
    }
    const body = chatBody.safeParse(req.body)
    if (!body.success) {
      res.status(400).json({ error: 'validation', message: body.error.issues[0]?.message ?? 'Invalid message' })
      return
    }
    const turn = chat.start(sessionUser(res).id, body.data.conversationId ?? null, body.data.message)
    if ('status' in turn) {
      res.status(turn.status).json({ error: turn.error, message: turn.message })
      return
    }
    res.status(200).set({ 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' })
    res.flushHeaders()
    // The turn finishes even if the admin leaves the page; only the writes stop.
    await turn.run((event) => {
      if (!res.writableEnded && !res.destroyed) res.write(`${JSON.stringify(event)}\n`)
    })
    res.end()
  })

  /** New chat: drop the old conversation now instead of after it idles out. Only your own. */
  router.delete('/chat/:id', (req, res) => {
    if (!chat?.end(sessionUser(res).id, req.params.id)) {
      res.status(404).json({ error: 'not_found', message: 'No such chat' })
      return
    }
    res.status(204).end()
  })

  router.use('/categories', createCategoriesRouter(games, servicesFor))

  for (const game of games) {
    if (game.adminRouter) router.use(`/${game.id}`, game.adminRouter(servicesFor(game)))
  }

  router.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'No such admin route' })
  })
  return router
}

const CATEGORY_STATUS: Record<CategoryError['code'], number> = { invalid: 400, not_found: 404, exists: 409, in_use: 409 }

/** /api/admin/categories/:gameId: the shared categories table, for games that use it. */
function createCategoriesRouter(games: readonly AnyGameModule[], servicesFor: (game: AnyGameModule) => ServerServices): Router {
  const router = express.Router()

  router.use('/:gameId', (req, res, next) => {
    const game = games.find((g) => g.id === req.params.gameId && g.categories)
    if (!game) {
      res.status(404).json({ error: 'not_found', message: 'That game has no categories' })
      return
    }
    res.locals.game = game
    next()
  })

  const handle =
    (fn: (services: ServerServices, req: express.Request) => unknown) =>
    (req: express.Request, res: express.Response) => {
      const game = res.locals.game as AnyGameModule
      try {
        res.json(fn(servicesFor(game), req))
      } catch (error) {
        if (!(error instanceof CategoryError)) throw error
        res.status(CATEGORY_STATUS[error.code]).json({ error: error.code, message: error.message })
      }
    }
  const id = (req: express.Request) => Number(req.params.id)
  const name = (req: express.Request) => String((req.body as { name?: unknown } | undefined)?.name ?? '')

  router.get('/:gameId', (req, res) => {
    const game = res.locals.game as AnyGameModule
    const services = servicesFor(game)
    const usage = game.categories!.usage(services)
    res.json({ categories: services.categories.list().map((c) => ({ ...c, count: usage[c.id] ?? 0 })) })
  })
  router.post('/:gameId', handle((services, req) => services.categories.create(name(req))))
  router.patch('/:gameId/:id', handle((services, req) => services.categories.rename(id(req), name(req))))
  router.delete(
    '/:gameId/:id',
    handle((services, req) => {
      services.categories.remove(id(req))
      return { removed: true }
    }),
  )
  return router
}
