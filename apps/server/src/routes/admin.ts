/**
 * /api/admin: core admin routes plus each game's adminRouter at
 * /api/admin/<gameId>. The Origin check and requireAdmin run before any game
 * code, and a game router only ever sees paths under its own prefix.
 * User management itself goes through Better Auth's admin endpoints
 * (/api/auth/admin/*), which enforce the admin role on their own.
 */
import type { AnyGameModule, ServerServices } from '@wsfg/core/contract'
import express, { type Router } from 'express'
import type { Auth } from '../auth.ts'
import type { Config } from '../config.ts'
import { originCheck, rateLimit, RateLimiter, requireAdmin, sessionUser } from '../middleware.ts'

export interface AdminRouterDeps {
  config: Config
  auth: Auth
  games: readonly AnyGameModule[]
  servicesFor: (game: AnyGameModule) => ServerServices
}

export function createAdminRouter({ config, auth, games, servicesFor }: AdminRouterDeps): Router {
  const router = express.Router()
  router.use(originCheck(config))
  router.use(requireAdmin(auth))
  router.use(rateLimit(new RateLimiter({ windowMs: 60_000, max: 300 }), (_req, res) => sessionUser(res).id))
  router.use(express.json({ limit: '256kb' }))

  router.get('/status', (_req, res) => {
    res.json({
      games: games.map((g) => ({ id: g.id, name: g.name, hasAdmin: !!g.adminRouter })),
      aiEnabled: !!config.ANTHROPIC_API_KEY,
    })
  })

  for (const game of games) {
    if (game.adminRouter) router.use(`/${game.id}`, game.adminRouter(servicesFor(game)))
  }

  router.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'No such admin route' })
  })
  return router
}
