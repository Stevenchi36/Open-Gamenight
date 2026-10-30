/**
 * "Is there a newer version?" for the admin Overview. Compares the running commit with the
 * upstream branch through GitHub's public compare API. It only reports: updating stays a
 * host command, because a container able to update itself would need the Docker socket,
 * which is root on the host (docs/decisions.md).
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import type { Clock } from './clock.ts'
import type { Config } from './config.ts'
import type { AppLogger } from './logger.ts'

const BRANCH = 'main'
const CHECKED_TTL_MS = 6 * 60 * 60_000
const ERROR_TTL_MS = 30 * 60_000
/** "Check again" can't run more often than this (GitHub allows 60 unauthenticated calls an hour per IP). */
const MIN_RECHECK_MS = 60_000
const SHA = /^[0-9a-f]{40}$/

/** Where the running commit came from: the Docker image's APP_COMMIT, or the git checkout. */
export type VersionSource = 'image' | 'git'

export interface RunningVersion {
  commit: string | null
  source: VersionSource | null
}

export type UpdateCheck =
  | { state: 'off' }
  | { state: 'unknown_version' }
  | { state: 'error'; message: string; checkedAt: number }
  | {
      state: 'checked'
      /** behind: newer commits upstream; ahead: only local commits; diverged: both. */
      status: 'current' | 'behind' | 'ahead' | 'diverged'
      newCommits: number
      localCommits: number
      compareUrl: string
      checkedAt: number
    }

export interface UpdateStatus extends RunningVersion {
  repo: string | null
  branch: string
  check: UpdateCheck
}

export interface UpdateChecker {
  status(options?: { refresh?: boolean }): Promise<UpdateStatus>
}

/** The commit the image was built from, else the checkout's HEAD. */
export function runningVersion(config: Pick<Config, 'APP_COMMIT' | 'rootDir'>): RunningVersion {
  if (config.APP_COMMIT) return { commit: config.APP_COMMIT, source: 'image' }
  const commit = readGitHead(config.rootDir)
  return commit ? { commit, source: 'git' } : { commit: null, source: null }
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

interface CompareResponse {
  status: 'identical' | 'ahead' | 'behind' | 'diverged'
  ahead_by: number
  behind_by: number
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

  async function check(commit: string, repo: string): Promise<Extract<UpdateCheck, { checkedAt: number }>> {
    const checkedAt = clock.now()
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/compare/${commit}...${BRANCH}`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'open-gamenight-update-check' },
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status === 404) {
        return { state: 'error', checkedAt, message: `${repo} isn't public, or doesn't have this version (a fork or local commits)` }
      }
      if (res.status === 403 || res.status === 429) {
        return { state: 'error', checkedAt, message: 'GitHub is rate-limiting this server' }
      }
      if (!res.ok) return { state: 'error', checkedAt, message: `GitHub answered ${res.status}` }
      // base is the running commit and head is the branch, so "ahead_by" counts commits we don't have.
      const body = (await res.json()) as CompareResponse
      const newCommits = body.ahead_by
      const localCommits = body.behind_by
      return {
        state: 'checked',
        status: newCommits > 0 ? (localCommits > 0 ? 'diverged' : 'behind') : localCommits > 0 ? 'ahead' : 'current',
        newCommits,
        localCommits,
        compareUrl: `https://github.com/${repo}/compare/${commit.slice(0, 12)}...${BRANCH}`,
        checkedAt,
      }
    } catch (error) {
      return { state: 'error', checkedAt, message: error instanceof Error && error.name === 'TimeoutError' ? 'GitHub timed out' : "Couldn't reach GitHub" }
    }
  }

  return {
    async status({ refresh = false } = {}) {
      const base = { ...version, repo, branch: BRANCH }
      if (!repo) return { ...base, check: { state: 'off' } }
      if (!version.commit) return { ...base, check: { state: 'unknown_version' } }

      const now = clock.now()
      if (cached && now < cached.expiresAt && !(refresh && now - cached.checkedAt >= MIN_RECHECK_MS)) {
        return { ...base, check: cached.check }
      }
      if (!pending) {
        pending = check(version.commit, repo).then((result) => {
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
