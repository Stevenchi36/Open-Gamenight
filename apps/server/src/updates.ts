/**
 * "Is there a newer version?" for the admin Overview. Compares the running version (the root
 * package.json's) with the upstream repo's latest GitHub release. It only reports: updating
 * stays a host command, because a container able to update itself would need the Docker
 * socket, which is root on the host (docs/decisions.md).
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import type { Clock } from './clock.ts'
import type { Config } from './config.ts'
import type { AppLogger } from './logger.ts'
import { compareVersions, parseVersion, readAppVersion } from './version.ts'

const CHECKED_TTL_MS = 6 * 60 * 60_000
const ERROR_TTL_MS = 30 * 60_000
/** "Check again" can't run more often than this (GitHub allows 60 unauthenticated calls an hour per IP). */
const MIN_RECHECK_MS = 60_000
const SHA = /^[0-9a-f]{40}$/

/** Where the running commit came from: the Docker image's APP_COMMIT, or the git checkout. */
export type VersionSource = 'image' | 'git'

export interface RunningVersion {
  /** The release version (x.y.z) from the root package.json. */
  version: string | null
  commit: string | null
  source: VersionSource | null
}

export type UpdateCheck =
  | { state: 'off' }
  | { state: 'unknown_version' }
  | { state: 'error'; message: string; checkedAt: number }
  | {
      state: 'checked'
      /** behind: a newer release exists; ahead: running a version newer than the latest release. */
      status: 'current' | 'behind' | 'ahead'
      /** The latest release's version, without the tag's `v`. */
      latest: string
      releaseUrl: string
      checkedAt: number
    }

export interface UpdateStatus extends RunningVersion {
  repo: string | null
  check: UpdateCheck
}

export interface UpdateChecker {
  status(options?: { refresh?: boolean }): Promise<UpdateStatus>
}

/** The release version, plus the commit the image was built from, else the checkout's HEAD. */
export function runningVersion(config: Pick<Config, 'APP_COMMIT' | 'rootDir'>): RunningVersion {
  const version = readAppVersion(config.rootDir)
  if (config.APP_COMMIT) return { version, commit: config.APP_COMMIT, source: 'image' }
  const commit = readGitHead(config.rootDir)
  return commit ? { version, commit, source: 'git' } : { version, commit: null, source: null }
}

/** HEAD's commit from the .git files themselves, so the server doesn't need the git binary. */
export function readGitHead(rootDir: string): string | null {
  try {
    let gitDir = join(rootDir, '.git')
    if (!existsSync(gitDir)) return null
    // A worktree's .git is a file pointing at its own git dir; shared refs sit in commondir.
    if (statSync(gitDir).isFile()) {
      const target = /^gitdir: (.+)$/m.exec(readFileSync(gitDir, 'utf8'))?.[1]?.trim()
      if (!target) return null
      gitDir = isAbsolute(target) ? target : resolve(rootDir, target)
    }
    const commonFile = join(gitDir, 'commondir')
    const commonDir = existsSync(commonFile) ? resolve(gitDir, readFileSync(commonFile, 'utf8').trim()) : gitDir

    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
    const ref = /^ref: (.+)$/.exec(head)?.[1]
    if (!ref) return SHA.test(head) ? head : null
    for (const dir of [gitDir, commonDir]) {
      const file = join(dir, ref)
      if (existsSync(file)) {
        const sha = readFileSync(file, 'utf8').trim()
        return SHA.test(sha) ? sha : null
      }
    }
    const packed = join(commonDir, 'packed-refs')
    if (!existsSync(packed)) return null
    for (const line of readFileSync(packed, 'utf8').split('\n')) {
      const [sha, name] = line.trim().split(' ')
      if (name === ref && sha && SHA.test(sha)) return sha
    }
    return null
  } catch {
    return null
  }
}

/** The fields used from GitHub's "latest release" (which skips drafts and pre-releases). */
interface ReleaseResponse {
  tag_name: string
  html_url: string
}

export function createUpdateChecker({
  config,
  version,
  clock,
  logger,
  fetch = globalThis.fetch,
}: {
  config: Pick<Config, 'UPDATE_CHECK_REPO'>
  version: RunningVersion
  clock: Pick<Clock, 'now'>
  logger: AppLogger
  fetch?: typeof globalThis.fetch
}): UpdateChecker {
  const repo = config.UPDATE_CHECK_REPO || null
  let cached: { check: UpdateCheck; checkedAt: number; expiresAt: number } | null = null
  let pending: Promise<UpdateCheck> | null = null

  async function check(version: string, repo: string): Promise<Extract<UpdateCheck, { checkedAt: number }>> {
    const checkedAt = clock.now()
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'open-gamenight-update-check' },
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status === 404) {
        return { state: 'error', checkedAt, message: `${repo} has no published releases, or isn't public` }
      }
      if (res.status === 403 || res.status === 429) {
        return { state: 'error', checkedAt, message: 'GitHub is rate-limiting this server' }
      }
      if (!res.ok) return { state: 'error', checkedAt, message: `GitHub answered ${res.status}` }
      const body = (await res.json()) as ReleaseResponse
      const latest = parseVersion(body.tag_name)
      const running = parseVersion(version)
      if (!latest || !running) {
        return { state: 'error', checkedAt, message: `the latest release's tag (${body.tag_name}) isn't a version number` }
      }
      const order = compareVersions(running, latest)
      return {
        state: 'checked',
        status: order < 0 ? 'behind' : order > 0 ? 'ahead' : 'current',
        latest: latest.join('.'),
        releaseUrl: body.html_url,
        checkedAt,
      }
    } catch (error) {
      return { state: 'error', checkedAt, message: error instanceof Error && error.name === 'TimeoutError' ? 'GitHub timed out' : "Couldn't reach GitHub" }
    }
  }

  return {
    async status({ refresh = false } = {}) {
      const base = { ...version, repo }
      if (!repo) return { ...base, check: { state: 'off' } }
      if (!version.version) return { ...base, check: { state: 'unknown_version' } }

      const now = clock.now()
      if (cached && now < cached.expiresAt && !(refresh && now - cached.checkedAt >= MIN_RECHECK_MS)) {
        return { ...base, check: cached.check }
      }
      if (!pending) {
        pending = check(version.version, repo).then((result) => {
          if (result.state === 'error') logger.warn('update check failed', { repo, message: result.message })
          const { checkedAt } = result
          cached = { check: result, checkedAt, expiresAt: checkedAt + (result.state === 'error' ? ERROR_TTL_MS : CHECKED_TTL_MS) }
          pending = null
          return result
        })
      }
      return { ...base, check: await pending }
    },
  }
}
