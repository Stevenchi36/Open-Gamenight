/**
 * Better Auth: email + password with public sign-up closed, admin plugin for
 * roles/bans/user management. Accounts are created by admins (or the
 * create-admin script for the first one).
 */
import { accountName } from '@ogn/core/protocol'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api'
import { getMigrations } from 'better-auth/db/migration'
import { admin } from 'better-auth/plugins'
import type { DatabaseSync } from 'node:sqlite'
import type { Config } from './config.ts'

/** Better Auth routes that set user.name, and where the name sits in their body. */
const NAME_FIELDS: Record<string, 'name' | 'data.name'> = {
  '/update-user': 'name',
  '/admin/create-user': 'name',
  '/admin/update-user': 'data.name',
}

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
      // Better Auth accepts any string as a name. Every route that sets one goes through the
      // core rule, trimmed: a user renaming themselves, and an admin creating or editing a user.
      before: createAuthMiddleware(async (ctx) => {
        const field = NAME_FIELDS[ctx.path]
        if (!field) return
        const body = (ctx.body ?? {}) as Record<string, unknown>
        const holder = (field === 'data.name' ? body.data : body) as Record<string, unknown> | undefined
        if (!holder || !('name' in holder)) return
        const parsed = accountName.safeParse(holder.name)
        if (!parsed.success) throw new APIError('BAD_REQUEST', { message: parsed.error.issues[0]!.message })
        const named = { ...holder, name: parsed.data }
        // Merged into the request context by Better Auth.
        return { context: { body: field === 'data.name' ? { ...body, data: named } : named } }
      }),
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
        // It checks the current password, so a stolen session could otherwise guess at it quickly.
        '/change-password': { window: 60, max: 5 },
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
