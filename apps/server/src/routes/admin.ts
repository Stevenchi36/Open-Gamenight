/**
 * /api/admin: core admin routes plus each game's adminRouter at
 * /api/admin/<gameId>. The Origin check and requireAdmin run before any game
 * code, and a game router only ever sees paths under its own prefix.
 * User management itself goes through Better Auth's admin endpoints
 * (/api/auth/admin/*), which enforce the admin role on their own.
 */
import { CategoryError } from '@wsfg/core/categories'
import type { AnyGameModule, ServerServices } from '@wsfg/core/contract'
import express, { type Router } from 'express'
import type { AiCore } from '../ai.ts'
import type { Auth } from '../auth.ts'
import type { Config } from '../config.ts'
import { originCheck, rateLimit, RateLimiter, requireAdmin, sessionUser } from '../middleware.ts'

export interface AdminRouterDeps {
  config: Config
  auth: Auth
  games: readonly AnyGameModule[]
  ai: AiCore | null
  servicesFor: (game: AnyGameModule) => ServerServices
}

export function createAdminRouter({ config, auth, games, ai, servicesFor }: AdminRouterDeps): Router {
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
