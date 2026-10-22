/**
 * stdio MCP server: registers every game's mcpTools as `<gameId>_<tool>`,
 * over the same library code the server uses. Opens games.db only (never
 * auth.db).
 *
 * stdout IS the protocol here. Never console.log in this process or anything
 * it imports; the shared logger writes to stderr.
 *
 *   claude mcp add ws-family-games --env GAMES_DB_PATH=/abs/path/data/games.db \
 *     -- node /abs/path/apps/mcp/src/server.ts
 */
import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { createCategoryService } from '@wsfg/core/categories'
import type { AnyGameModule, ServerServices } from '@wsfg/core/contract'
import { games } from '@wsfg/games/server'
import { createAiCore } from '@wsfg/server/ai'
import { findRootDir } from '@wsfg/server/config'
import { migrateGamesDb, openDatabase } from '@wsfg/server/db'
import { createLogger } from '@wsfg/server/logger'

const logger = createLogger('mcp', 'info')
const root = findRootDir(import.meta.dirname)
// Same .env as the web server (never overrides variables the MCP client set).
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))

/** GAMES_DB_PATH, absolute or relative to the repo root (the client's cwd is unknown). */
function gamesDbPath(): string {
  const raw = process.env.GAMES_DB_PATH?.trim()
  if (!raw) return join(root, 'data', 'games.db')
  return isAbsolute(raw) ? raw : resolve(root, raw)
}

export async function main(): Promise<void> {
  const path = gamesDbPath()
  const db = openDatabase(path)
  migrateGamesDb(db, games, logger)
  logger.info('using games.db', { path })

  const env = process.env
  const ai = createAiCore({
    config: {
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY?.trim() || undefined,
      ANTHROPIC_MODEL: env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-5-5',
      AI_DAILY_OUTPUT_TOKEN_CAP: Number(env.AI_DAILY_OUTPUT_TOKEN_CAP) || 200_000,
      AI_PER_ADMIN_CALLS_PER_HOUR: Number(env.AI_PER_ADMIN_CALLS_PER_HOUR) || 20,
    },
    db,
    logger: logger.child('ai'),
  })
  logger.info(ai ? 'AI generation enabled' : 'AI generation disabled (no ANTHROPIC_API_KEY)')

  const server = new McpServer({ name: 'ws-family-games', version: '0.1.0' })
  for (const game of games) {
    registerGameTools(server, game, {
      gameId: game.id,
      db,
      ai: ai?.forGame(game.id) ?? null,
      logger: logger.child(game.id),
      categories: createCategoryService(db, game.id),
    })
  }

  const transport = new StdioServerTransport()
  transport.onclose = () => {
    db.close()
    process.exit(0)
  }
  await server.connect(transport)
}

function registerGameTools(server: McpServer, game: AnyGameModule, services: ServerServices): void {
  for (const tool of game.mcpTools?.(services) ?? []) {
    const name = `${game.id}_${tool.name}`
    server.registerTool(name, { description: tool.description, inputSchema: tool.inputSchema }, async (args: unknown) => {
      try {
        const result = await tool.handler(args)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (error) {
        logger.error(`${name} failed`, { error: error instanceof Error ? error.message : String(error) })
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    })
    logger.info('registered tool', { name })
  }
}

await main()
