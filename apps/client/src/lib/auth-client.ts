/** Better Auth client. Same origin in prod; in dev Vite proxies /api, so no baseURL either way. */
import { adminClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient({ plugins: [adminClient()] })

export type SessionData = (typeof authClient.$Infer)['Session']
