/**
 * Opens databases, runs migrations, builds auth. Shared by the server entry
 * point and the create-admin script.
 */
import { assertValidRegistry, type AnyGameModule } from '@wsfg/core/contract'
import { games as registry } from '@wsfg/games/server'
import { createAuth, type AuthOptions } from './auth.ts'
import type { Config } from './config.ts'
import { migrateGamesDb, openDatabase } from './db.ts'
import { createLogger } from './logger.ts'

export interface BootOptions {
  auth?: AuthOptions
  /** Defaults to the static registry; tests pass extra games. */
  games?: readonly AnyGameModule[]
}

export async function boot(config: Config, options: BootOptions = {}) {
  const games = options.games ?? registry
  const logger = createLogger('server', config.LOG_LEVEL)
  assertValidRegistry(games)

  const authDb = openDatabase(config.authDbPath)
  const gamesDb = openDatabase(config.gamesDbPath)
  const auth = await createAuth(config, authDb, options.auth)
  migrateGamesDb(gamesDb, games, logger.child('db'))

  const close = () => {
    authDb.close()
    gamesDb.close()
  }
  return { config, logger, auth, authDb, gamesDb, games, close }
}

export type Booted = Awaited<ReturnType<typeof boot>>
