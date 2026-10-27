/**
 * Better Auth: email + password with public sign-up closed, admin plugin for
 * roles/bans/user management. Accounts are created by admins (or the
 * create-admin script for the first one).
 */
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { createAuthMiddleware, isAPIError } from 'better-auth/api'
import { getMigrations } from 'better-auth/db/migration'
import { admin } from 'better-auth/plugins'
import type { DatabaseSync } from 'node:sqlite'
import type { Config } from './config.ts'

/**
 * The client IP, computed once by our realIp middleware (which overwrites any
 * client-sent value). Better Auth reads only this header, so its rate limits
 * can't be dodged by spoofing X-Forwarded-For.
 */
export const INTERNAL_IP_HEADER = 'x-ogn-client-ip'

export interface AuthOptions {
  /** Defaults to on. Tests turn it off so repeated sign-ins don't trip it. */
  rateLimit?: boolean
}

function authOptions(config: Config, db: DatabaseSync, options: AuthOptions) {
  return {
    appName: config.APP_NAME,
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: db,
    trustedOrigins: config.ALLOWED_ORIGINS,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    plugins: [admin()],
    hooks: {
      // The admin plugin's set-user-password keeps existing sessions, and
      // revokeSessionsOnPasswordReset only covers the emailed reset flow. An
      // admin resetting a compromised account must also sign out whoever has it.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/admin/set-user-password' || isAPIError(ctx.context.returned)) return
        await ctx.context.internalAdapter.deleteUserSessions(String(ctx.body.userId))
      }),
    },
    rateLimit: {
      // Better Auth only enables this in production by default; we want it everywhere.
      enabled: options.rateLimit ?? true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: config.NODE_ENV === 'production',
      ipAddress: { ipAddressHeaders: [INTERNAL_IP_HEADER] },
    },
  } satisfies BetterAuthOptions
}

/** Migrates auth.db (what `npx auth migrate` does), then creates the instance. */
export async function createAuth(config: Config, db: DatabaseSync, options: AuthOptions = {}) {
  const resolved = authOptions(config, db, options)
  const { runMigrations } = await getMigrations(resolved)
  await runMigrations()
  return betterAuth(resolved)
}

export type Auth = Awaited<ReturnType<typeof createAuth>>

export type SessionUser = { id: string; name: string; email: string; role: 'user' | 'admin' }

/** Normalize Better Auth's session user to what the rest of the server needs. */
export function toSessionUser(user: { id: string; name: string; email: string; role?: string | null }): SessionUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role === 'admin' ? 'admin' : 'user' }
}
