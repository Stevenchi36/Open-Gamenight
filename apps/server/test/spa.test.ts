import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readBuildId } from '../src/app.ts'
import { startTestServer, type TestServer } from './helpers/server.ts'

let t: TestServer
let root: string

beforeAll(async () => {
  // A fake built client, as `pnpm build` leaves it in production.
  root = mkdtempSync(join(tmpdir(), 'wsfg-spa-'))
  const dist = join(root, 'apps', 'client', 'dist')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>spa</title>')
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)')
  t = await startTestServer({ rootDir: root })
})
afterAll(async () => {
  await t.close()
  rmSync(root, { recursive: true, force: true })
})

describe('built client', () => {
  it('serves index.html at the root', async () => {
    const res = await t.fetch('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<title>spa</title>')
  })

  it('falls back to index.html for client routes', async () => {
    const res = await t.fetch('/room/ABCD')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<title>spa</title>')
  })

  it('serves static assets', async () => {
    const res = await t.fetch('/assets/app.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('console.log(1)')
  })

  it('keeps unknown API routes as JSON 404s', async () => {
    const res = await t.fetch('/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'not_found' })
  })
})

describe('readBuildId', () => {
  it('reads the id Vite stamped into index.html, or null without one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wsfg-build-'))
    try {
      expect(readBuildId(dir)).toBeNull()
      writeFileSync(join(dir, 'index.html'), '<!doctype html><title>spa</title>')
      expect(readBuildId(dir)).toBeNull()
      writeFileSync(join(dir, 'index.html'), '<head><meta name="wsfg-build" content="lq3x9a"></head>')
      expect(readBuildId(dir)).toBe('lq3x9a')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
