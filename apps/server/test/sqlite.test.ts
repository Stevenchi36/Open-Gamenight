import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

// Smoke test: fails with "could not locate the bindings file" if the native
// build script was blocked or built for a different Node version.
describe('better-sqlite3', () => {
  it('loads the native binding and runs a query', () => {
    const db = new Database(':memory:')
    expect(db.prepare('select 1 + 1 as n').get()).toEqual({ n: 2 })
    db.close()
  })
})
