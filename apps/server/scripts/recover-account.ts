/**
 * A one-time recovery code for an account nobody can reset in the app (src/recovery.ts):
 *   pnpm recover-account --email you@example.com
 *   docker compose exec app node apps/server/scripts/recover-account.ts --email you@example.com
 * The person enters it at /recover ("Have a recovery code?" on the sign-in page) with a new
 * password. Works once, for 24 hours; making it signs the account out everywhere.
 * Uses the same config and auth.db as the server, which can keep running.
 */
import { parseArgs } from 'node:util'
import { boot } from '../src/boot.ts'
import { loadConfig } from '../src/config.ts'
import { createRecoveryCode } from '../src/recovery.ts'

const { values } = parseArgs({ options: { email: { type: 'string' } } })

if (!values.email) {
  console.error('Usage: pnpm recover-account --email you@example.com')
  process.exit(1)
}

const config = loadConfig()
const booted = await boot({ ...config, LOG_LEVEL: 'warn' })
try {
  // Better Auth checks the schema in the background at start; a short run (an unknown email)
  // would otherwise close the database under it and log a false "could not validate".
  await (await booted.auth.$context).checkSchema?.()
  const result = await createRecoveryCode(booted.auth, values.email)
  if (!result.ok) {
    console.error(result.error)
    process.exitCode = 1
  } else {
    const { user, code, expiresAt } = result
    console.log(`Recovery code for ${user.name} (${user.email}):\n`)
    console.log(`    ${code}\n`)
    console.log(`Works once, until ${expiresAt.toLocaleString()}. Any earlier code is void, and the account is signed out everywhere.`)
    console.log(`Enter it at ${config.BETTER_AUTH_URL.replace(/\/$/, '')}/recover ("Have a recovery code?" on the sign-in page) with a new password.`)
    if (user.banned) console.log('\nThis account is banned: the code sets a new password, but signing in stays blocked until an admin unbans it.')
  }
} finally {
  booted.close()
}
