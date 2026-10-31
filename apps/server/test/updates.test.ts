import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLogger } from '../src/logger.ts'
import { createUpdateChecker, readGitHead, runningVersion, type RunningVersion } from '../src/updates.ts'
import { startTestServer, type TestServer } from './helpers/server.ts'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const logger = createLogger('test', 'silent')

const release = (tag: string) => Response.json({ tag_name: tag, html_url: `https://github.com/owner/repo/releases/tag/${tag}` })

function checker(options: { repo?: string; version?: RunningVersion; respond?: () => Response | Promise<Response> } = {}) {
  const clock = { t: 1_000_000, now: () => clock.t }
  const calls: string[] = []
  const fetch = (async (url: string | URL | Request) => {
    calls.push(String(url))
    return (options.respond ?? (() => release('v0.2.0')))()
  }) as typeof globalThis.fetch
  const updates = createUpdateChecker({
    config: { UPDATE_CHECK_REPO: options.repo ?? 'owner/repo' },
    version: options.version ?? { version: '0.1.0', commit: A, source: 'image' },
    clock,
    logger,
    fetch,
  })
  return { updates, calls, clock }
}

describe('update check', () => {
  it('reports a newer release than the running version', async () => {
    const { updates, calls } = checker()
    const status = await updates.status()
    expect(calls).toEqual(['https://api.github.com/repos/owner/repo/releases/latest'])
    expect(status).toMatchObject({
      version: '0.1.0',
      commit: A,
      source: 'image',
      repo: 'owner/repo',
      check: { state: 'checked', status: 'behind', latest: '0.2.0', releaseUrl: 'https://github.com/owner/repo/releases/tag/v0.2.0' },
    })
  })

  it('tells current and ahead apart, comparing numbers rather than text', async () => {
    const cases = [
      ['v0.1.0', 'current'],
      ['v0.0.9', 'ahead'],
      ['v0.10.0', 'behind'],
    ] as const
    for (const [tag, expected] of cases) {
      const { updates } = checker({ respond: () => release(tag) })
      expect((await updates.status()).check).toMatchObject({ state: 'checked', status: expected })
    }
  })

  it("reports a release tag that isn't a version", async () => {
    const { updates } = checker({ respond: () => release('nightly') })
    expect((await updates.status()).check).toMatchObject({ state: 'error', message: expect.stringContaining('nightly') })
  })

  it("doesn't call GitHub when turned off or when the version is unknown", async () => {
    const off = checker({ repo: '' })
    expect((await off.updates.status()).check).toEqual({ state: 'off' })
    const unknown = checker({ version: { version: null, commit: A, source: 'image' } })
    expect((await unknown.updates.status()).check).toEqual({ state: 'unknown_version' })
    expect([...off.calls, ...unknown.calls]).toEqual([])
  })

  it('caches the answer, and "check again" waits a minute between calls', async () => {
    const { updates, calls, clock } = checker()
    await updates.status()
    await updates.status()
    await updates.status({ refresh: true })
    expect(calls).toHaveLength(1)
    clock.t += 60_000
    await updates.status({ refresh: true })
    expect(calls).toHaveLength(2)
    clock.t += 6 * 60 * 60_000
    await updates.status()
    expect(calls).toHaveLength(3)
  })

  it('shares one request between concurrent callers', async () => {
    const { updates, calls } = checker()
    await Promise.all([updates.status(), updates.status(), updates.status()])
    expect(calls).toHaveLength(1)
  })

  it('reports failures without throwing, and retries sooner than after a success', async () => {
    const responses = [new Response('', { status: 404 }), new Response('', { status: 403 })]
    const { updates, calls, clock } = checker({ respond: () => responses.shift() ?? Promise.reject(new TypeError('fetch failed')) })
    expect((await updates.status()).check).toMatchObject({ state: 'error', message: expect.stringContaining('no published releases') })
    clock.t += 30 * 60_000
    expect((await updates.status()).check).toMatchObject({ state: 'error', message: expect.stringContaining('rate-limiting') })
    clock.t += 30 * 60_000
    expect((await updates.status()).check).toMatchObject({ state: 'error', message: "Couldn't reach GitHub" })
    expect(calls).toHaveLength(3)
  })
})

describe('running version', () => {
  const git = (files: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), 'ogn-git-'))
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(root, path, '..'), { recursive: true })
      writeFileSync(join(root, path), content)
    }
    return root
  }

  it("reads the version from package.json, and prefers the image's APP_COMMIT", () => {
    const root = git({ '.git/HEAD': `${B}\n`, 'package.json': '{ "version": "1.2.3" }' })
    expect(runningVersion({ APP_COMMIT: A, rootDir: root })).toEqual({ version: '1.2.3', commit: A, source: 'image' })
    expect(runningVersion({ APP_COMMIT: undefined, rootDir: root })).toEqual({ version: '1.2.3', commit: B, source: 'git' })
    expect(runningVersion({ APP_COMMIT: undefined, rootDir: git({}) })).toEqual({ version: null, commit: null, source: null })
  })

  it('reads a branch ref, a packed ref, a detached HEAD and a worktree', () => {
    expect(readGitHead(git({ '.git/HEAD': 'ref: refs/heads/main\n', '.git/refs/heads/main': `${A}\n` }))).toBe(A)
    expect(readGitHead(git({ '.git/HEAD': 'ref: refs/heads/main\n', '.git/packed-refs': `# pack-refs\n${B} refs/heads/main\n` }))).toBe(B)
    expect(readGitHead(git({ '.git/HEAD': `${A}\n` }))).toBe(A)
    const main = git({ '.git/HEAD': 'ref: refs/heads/main\n', '.git/refs/heads/feature': `${B}\n`, '.git/worktrees/wt/HEAD': 'ref: refs/heads/feature\n', '.git/worktrees/wt/commondir': '../..\n' })
    const worktree = git({ '.git': `gitdir: ${join(main, '.git/worktrees/wt')}\n` })
    expect(readGitHead(worktree)).toBe(B)
  })

  it('gives null without a usable .git', () => {
    expect(readGitHead(git({}))).toBeNull()
    expect(readGitHead(git({ '.git/HEAD': 'ref: refs/heads/gone\n' }))).toBeNull()
  })
})

describe('/api/admin/updates', () => {
  let t: TestServer
  beforeAll(async () => {
    t = await startTestServer()
    await t.createUser('admin@example.com', 'admin')
    await t.createUser('user@example.com', 'user')
  }, 30_000)
  afterAll(async () => {
    await t.close()
  })

  it('is admin-only and reports the open rooms an update would end', async () => {
    expect((await t.fetch('/api/admin/updates')).status).toBe(401)
    expect((await t.fetch('/api/admin/updates', { cookie: await t.signIn('user@example.com') })).status).toBe(403)
    const res = await t.fetch('/api/admin/updates', { cookie: await t.signIn('admin@example.com') })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ repo: null, openRooms: 0, check: { state: 'off' } })
  })
})
