import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

// Smoke test: node:sqlite is built into Node (release candidate since 25.7).
// Fails here first if the Node version in use doesn't ship it.
describe('node:sqlite', () => {
  it('opens a database and runs a query', () => {
    const db = new DatabaseSync(':memory:')
    expect({ ...db.prepare('select 1 + 1 as n').get() }).toEqual({ n: 2 })
    db.close()
  })
})
