/**
 * CI's release step (.github/workflows/ci.yml): checks a pushed tag matches the root
 * package.json's version and prints that version's CHANGELOG.md section as the release notes.
 *   node apps/server/scripts/release-notes.ts v0.1.0
 * Fails, so nothing is published, when the tag and version differ or the section is missing.
 * Node built-ins only: CI's release job runs it without installing dependencies.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { changelogSection, readAppVersion } from '../src/version.ts'

const tag = process.argv[2]
const rootDir = resolve(import.meta.dirname, '../../..')
const version = readAppVersion(rootDir)

if (!tag || !version) {
  console.error(tag ? 'The root package.json has no plain x.y.z version' : 'Usage: node apps/server/scripts/release-notes.ts v<version>')
  process.exit(1)
}
if (tag !== `v${version}`) {
  console.error(`Tag ${tag} doesn't match package.json's version ${version} (expected v${version})`)
  process.exit(1)
}
const notes = changelogSection(readFileSync(join(rootDir, 'CHANGELOG.md'), 'utf8'), version)
if (!notes) {
  console.error(`CHANGELOG.md has no "## [${version}]" section, or it's empty`)
  process.exit(1)
}
console.log(notes)
