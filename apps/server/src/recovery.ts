/**
 * Recovery codes: the way back into an account when nobody can reset its password in the app
 * (the only admin forgot theirs, or there's no admin to ask). Made by a command on the server
 * (scripts/recover-account.ts); the person enters it on /recover with a new password.
 *
 * A code is a Better Auth password-reset token, so redeeming it is Better Auth's own
 * /reset-password (one use, expiry, session revocation) and nothing here touches the password.
 * auth.ts stores these tokens hashed and rate-limits /reset-password.
 */
import { randomInt } from 'node:crypto'
import type { Auth } from './auth.ts'

export const RECOVERY_TTL_MS = 24 * 60 * 60_000
/** No 0/O, 1/I/L or U: read aloud or copied by hand without mix-ups. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
/** 12 characters of 30 is about 59 bits. */
const LENGTH = 12

/** The form people see and type: ABCD-EFGH-JKMN. */
export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)!.join('-')
}

/** What's stored and checked: upper case, no dashes or spaces. Mirrored on /recover. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export type RecoveryResult =
  | { ok: true; code: string; expiresAt: Date; user: { id: string; email: string; name: string; banned: boolean } }
  | { ok: false; error: string }

/**
 * Makes a code for the account with this email, replacing any earlier one, and signs the account
 * out everywhere: whoever lost access may not be the only one who had it.
 */
export async function createRecoveryCode(auth: Auth, email: string, { ttlMs = RECOVERY_TTL_MS, now = Date.now() } = {}): Promise<RecoveryResult> {
  const ctx = await auth.$context
  const found = await ctx.internalAdapter.findUserByEmail(email.trim())
  if (!found) return { ok: false, error: `No account has the email ${email.trim()}` }
  const { user } = found

  // Identifiers are stored hashed, so earlier codes are found by the user id they point at;
  // nothing else in this app keeps a verification row for a user.
  await ctx.adapter.deleteMany({ model: 'verification', where: [{ field: 'value', value: user.id }] })

  let code = ''
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  const expiresAt = new Date(now + ttlMs)
  await ctx.internalAdapter.createVerificationValue({ identifier: `reset-password:${code}`, value: user.id, expiresAt })
  await ctx.internalAdapter.deleteUserSessions(user.id)

  const banned = !!(user as { banned?: boolean | null }).banned
  return { ok: true, code: formatRecoveryCode(code), expiresAt, user: { id: user.id, email: user.email, name: user.name, banned } }
}
