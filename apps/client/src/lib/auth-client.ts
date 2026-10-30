/** Better Auth client. Same origin in prod; in dev Vite proxies /api, so no baseURL either way. */
import { passkeyClient } from '@better-auth/passkey/client'
import { adminClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient({ plugins: [adminClient(), passkeyClient()] })

export type SessionData = (typeof authClient.$Infer)['Session']

/** Better Auth's error code, which only some of its error shapes declare. */
export const errorCode = (error: object): string => ('code' in error && typeof error.code === 'string' ? error.code : '')

/**
 * Browsers only offer WebAuthn on HTTPS or localhost, so a server reached over plain HTTP on
 * the home network (docs/self-hosting.md) shows passwords only.
 */
export const passkeysSupported = typeof window !== 'undefined' && window.isSecureContext && 'PublicKeyCredential' in window
