/**
 * Server configuration from environment variables (see .env.example).
 * Relative paths resolve against the repo root, wherever the process starts.
 */
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'

const int = (fallback: number) => z.coerce.number().int().min(0).default(fallback)
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined))

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: int(3000),
  APP_NAME: z.string().trim().min(1).default('Open Gamenight'),
  APP_PRIMARY_COLOR: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'APP_PRIMARY_COLOR must look like #6750A4 (quote it in .env)')
    .default('#6750A4'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url(),
  ALLOWED_ORIGINS: z
    .string()
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim().replace(/\/$/, ''))
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1, 'ALLOWED_ORIGINS needs at least one origin')),
  AUTH_DB_PATH: z.string().default('./data/auth.db'),
  GAMES_DB_PATH: z.string().default('./data/games.db'),
  TRUSTED_PROXY_HOPS: int(0),
  REAL_IP_HEADER: z
    .string()
    .default('')
    .transform((v) => v.trim().toLowerCase()),
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default('claude-haiku-5-5'),
  AI_DAILY_OUTPUT_TOKEN_CAP: int(200_000),
  AI_PER_ADMIN_CALLS_PER_HOUR: int(20),
  ANTHROPIC_CHAT_MODEL: z.string().default('claude-opus-5-5'),
  AI_CHAT_MESSAGES_PER_HOUR: int(60),
  MAX_ROOMS: int(50),
  MAX_ROOMS_PER_USER: int(2),
  ROOM_CREATION: z.enum(['accounts', 'anyone']).default('accounts'),
  /** GitHub owner/repo whose latest release the admin Overview compares against; empty turns the check off. */
  UPDATE_CHECK_REPO: z
    .string()
    .trim()
    .regex(/^([\w.-]+\/[\w.-]+)?$/,'UPDATE_CHECK_REPO must look like owner/repo, or be empty')
    .default('Stevenchi36/Open-Gamenight'),
  /** Set by the Docker image: the commit it was built from (there's no .git to read). */
  APP_COMMIT: optional.pipe(z.string().regex(/^[0-9a-f]{40}$/, 'APP_COMMIT must be a full commit SHA').optional()),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
})

export type Env = z.infer<typeof schema>

export interface Config extends Env {
  rootDir: string
  authDbPath: string
  gamesDbPath: string
  /** Built client (apps/client/dist), served when present. */
  clientDistDir: string
}

/** Repo root: the nearest ancestor of this file holding pnpm-workspace.yaml. */
export function findRootDir(start = import.meta.dirname): string {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    if (dirname(dir) === dir) return process.cwd()
  }
}

/** Validate an env object. Throws one readable error listing every problem. */
export function parseConfig(env: Record<string, string | undefined>, rootDir = findRootDir()): Config {
  const result = schema.safeParse(env)
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid configuration:\n${problems}`)
  }
  const abs = (p: string) => (isAbsolute(p) || p === ':memory:' ? p : resolve(rootDir, p))
  return {
    ...result.data,
    rootDir,
    authDbPath: abs(result.data.AUTH_DB_PATH),
    gamesDbPath: abs(result.data.GAMES_DB_PATH),
    clientDistDir: join(rootDir, 'apps', 'client', 'dist'),
  }
}

/** Load <root>/.env (if present, without overriding real env vars) and parse. */
export function loadConfig(): Config {
  const rootDir = findRootDir()
  const envFile = join(rootDir, '.env')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  return parseConfig(process.env, rootDir)
}
