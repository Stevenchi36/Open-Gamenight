import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findRootDir } from '../src/config.ts'
import { changelogSection, compareVersions, parseVersion, readAppVersion } from '../src/version.ts'

describe('versions', () => {
  it('parses x.y.z with or without the tag v, and nothing else', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('v0.10.0')).toEqual([0, 10, 0])
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('1.2.3-beta.1')).toBeNull()
  })

  it('compares by number', () => {
    expect(compareVersions([0, 10, 0], [0, 9, 9])).toBeGreaterThan(0)
    expect(compareVersions([1, 0, 0], [1, 0, 0])).toBe(0)
    expect(compareVersions([0, 1, 9], [0, 2, 0])).toBeLessThan(0)
  })

  it("reads the root package.json's version", () => {
    const root = (pkg: string) => {
      const dir = mkdtempSync(join(tmpdir(), 'ogn-version-'))
      writeFileSync(join(dir, 'package.json'), pkg)
      return dir
    }
    expect(readAppVersion(root('{ "version": "0.3.1" }'))).toBe('0.3.1')
    expect(readAppVersion(root('{ "name": "x" }'))).toBeNull()
    expect(readAppVersion(root('not json'))).toBeNull()
    expect(readAppVersion(mkdtempSync(join(tmpdir(), 'ogn-version-')))).toBeNull()
  })

  it("takes one version's changelog section", () => {
    const changelog = '# Changelog\n\n## [Unreleased]\n\n## [0.2.0] - 2026-11-05\n\n- New\n\n## [0.1.0] - 2026-10-30\n\n- First\n'
    expect(changelogSection(changelog, '0.2.0')).toBe('- New')
    expect(changelogSection(changelog, '0.1.0')).toBe('- First')
    expect(changelogSection(changelog, '0.3.0')).toBeNull()
    expect(changelogSection('## [0.1.0]\n\n## [0.0.1]\n', '0.1.0')).toBeNull()
  })

  it("the repo's own version has a changelog section, so a release of it can be published", () => {
    const root = findRootDir()
    const version = readAppVersion(root)
    expect(version).not.toBeNull()
    expect(changelogSection(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version!)).not.toBeNull()
  })
})
