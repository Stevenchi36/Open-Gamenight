/**
 * The app's release version: the root package.json's `version`, bumped once per release and
 * tagged `v<version>` (docs/decisions.md). Read from the file rather than an env var, so a git
 * checkout and a locally built image both know it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/

/** [major, minor, patch] from `1.2.3` or a `v1.2.3` tag; null for anything else (pre-releases included). */
export function parseVersion(text: string): [number, number, number] | null {
  const m = SEMVER.exec(text.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Negative when a is older than b, 0 when equal, positive when newer. */
export function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/** The root package.json's version, or null when it's missing or not plain x.y.z. */
export function readAppVersion(rootDir: string): string | null {
  try {
    const { version } = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as { version?: unknown }
    return typeof version === 'string' && parseVersion(version) ? version : null
  } catch {
    return null
  }
}

/** The body of CHANGELOG.md's `## [version]` section (up to the next `## ` heading), or null. */
export function changelogSection(changelog: string, version: string): string | null {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`))
  if (start === -1) return null
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '))
  const body = lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim()
  return body || null
}
