/**
 * Builds the Express app. Kept separate from index.ts so tests can boot the
 * exact same app on a random port with temp databases.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { AiCore } from './ai.ts'
import { createCategoryService } from '@ogn/core/categories'
import { MAX_PLAYERS_CAP, type AnyGameModule, type ServerServices } from '@ogn/core/contract'
import { toNodeHandler } from 'better-auth/node'
import express, { type ErrorRequestHandler, type Express } from 'express'
import type { Auth } from './auth.ts'
import { createAdminChat } from './chat.ts'
import type { Config } from './config.ts'
import type { AppLogger } from './logger.ts'
import { originCheck, rateLimit, RateLimiter, realIp } from './middleware.ts'
import { createAdminRouter, type AdminRooms } from './routes/admin.ts'

/**
 * The build id Vite stamped into the built client's index.html (`<meta name="ogn-build">`),
 * or null when there is no build (dev, tests without one).
 */
export function readBuildId(clientDistDir: string): string | null {
  const file = join(clientDistDir, 'index.html')
  if (!existsSync(file)) return null
  return /<meta name="ogn-build" content="([^"]+)"/.exec(readFileSync(file, 'utf8'))?.[1] ?? null
}

export interface AppDeps {
  config: Config
  auth: Auth
  gamesDb: DatabaseSync
  games: readonly AnyGameModule[]
  logger: AppLogger
  ai: AiCore | null
  /** For the admin rooms page. */
  rooms: AdminRooms
}

/**
 * Only admin-only code (admin routers) gets the AI service. Gameplay and public
 * routes get `ai: null`, so no player or guest can ever trigger a paid API call.
 */
export function createServices(
  deps: Pick<AppDeps, 'gamesDb' | 'logger' | 'ai'>,
  game: AnyGameModule,
  { admin = false }: { admin?: boolean } = {},
): ServerServices {
  return {
    gameId: game.id,
    db: deps.gamesDb,
    ai: admin ? (deps.ai?.forGame(game.id) ?? null) : null,
    logger: deps.logger.child(game.id),
    categories: createCategoryService(deps.gamesDb, game.id),
  }
}

/** /api/games/<gameId>/*: read-only game data for players (GET only, rate-limited per IP). */
function createPublicGameRouter(deps: AppDeps) {
  const router = express.Router()
  router.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next()
    res.status(405).json({ error: 'validation', message: 'Read-only' })
  })
  router.use(rateLimit(new RateLimiter({ windowMs: 60_000, max: 120 }), (_req, res) => String(res.locals.ip)))
  for (const game of deps.games) {
    if (game.publicRouter) router.use(`/${game.id}`, game.publicRouter(createServices(deps, game)))
  }
  return router
}

export function createApp(deps: AppDeps): Express {
  const { config, auth, games, logger } = deps
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.TRUSTED_PROXY_HOPS)
  app.use(realIp(config))

  // Better Auth must be mounted before any body parser (Express 5 catch-all syntax).
  // Our Origin check runs first: Better Auth skips its own when a request has no
  // cookies, which would allow cross-site sign-in (login CSRF).
  app.all('/api/auth/*splat', originCheck(config), toNodeHandler(auth))

  app.get('/api/config', (_req, res) => {
    res.json({
      appName: config.APP_NAME,
      primaryColor: config.APP_PRIMARY_COLOR,
      aiEnabled: !!deps.ai,
      // Alphabetical, like every game menu (the room's lobby list too).
      games: [...games].sort((a, b) => a.name.localeCompare(b.name)).map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        styles: g.styles,
        minPlayers: g.minPlayers,
        maxPlayers: Math.min(g.maxPlayers, MAX_PLAYERS_CAP),
      })),
    })
  })

  const servicesFor = (game: AnyGameModule) => createServices(deps, game, { admin: true })
  const chat = deps.ai ? createAdminChat({ ai: deps.ai, config, games, servicesFor, logger: logger.child('chat') }) : null
  app.use('/api/admin', createAdminRouter({ config, auth, games, ai: deps.ai, rooms: deps.rooms, servicesFor, chat }))

  app.use('/api/games', createPublicGameRouter(deps))

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'No such route' })
  })

  // Built SPA (production). In dev, Vite serves the client and proxies /api and /ws here.
  if (existsSync(join(config.clientDistDir, 'index.html'))) {
    app.use(express.static(config.clientDistDir, { index: false, maxAge: '1h' }))
    // `{*splat}` is optional, so `/` matches too; Express 5's `/*splat` needs at least one character.
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(join(config.clientDistDir, 'index.html'), (error) => {
        // dist/ can vanish under a running server (a build in place, a failed deploy).
        if (!error || res.headersSent) return
        logger.error('client build missing', { dir: config.clientDistDir })
        res.status(503).type('text').send('The site is being updated. Try again in a minute.')
      })
    })
  }

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    logger.error('request failed', { error: error instanceof Error ? error.stack : String(error) })
    if (res.headersSent) return
    const status = typeof error?.status === 'number' && error.status < 500 ? error.status : 500
    res.status(status).json({ error: status === 500 ? 'internal' : 'validation', message: status === 500 ? 'Something went wrong' : String(error.message) })
  }
  app.use(onError)
  return app
}
