/**
 * Create the first admin (or any admin) from the command line:
 *   pnpm create-admin --email you@example.com --name "You" --password "..."
 * Omit --password to be prompted for it.
 * Uses the same config and auth.db as the server.
 */
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { boot } from '../src/boot.ts'
import { loadConfig } from '../src/config.ts'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
    role: { type: 'string', default: 'admin' },
  },
})

if (!values.email || !values.name) {
  console.error('Usage: pnpm create-admin --email you@example.com --name "You" [--password ...] [--role admin|user]')
  process.exit(1)
}
if (values.role !== 'admin' && values.role !== 'user') {
  console.error('--role must be admin or user')
  process.exit(1)
}

let password = values.password
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  password = await rl.question('Password (min 8 chars): ')
  rl.close()
}

const booted = await boot({ ...loadConfig(), LOG_LEVEL: 'warn' })
try {
  const { user } = await booted.auth.api.createUser({
    body: { email: values.email, name: values.name, password, role: values.role },
  })
  console.error(`Created ${values.role} ${user.email} (${user.id})`)
} catch (error) {
  console.error(`Could not create user: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  booted.close()
}
