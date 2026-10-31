import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../../..')
/** Exported but not for games: the app mounts it once (App.vue). */
const APP_ONLY = ['LiveRegion']

describe('games/CLAUDE.md', () => {
  // Read as text: the barrel's .vue files only load in the client build.
  it('names every component @ogn/core/ui exports, so a game author finds it before writing their own', () => {
    const barrel = readFileSync(join(root, 'packages/core/src/ui/index.ts'), 'utf8')
    const components = [...barrel.matchAll(/export \{ default as (\w+) \}/g)].map((m) => m[1]!)
    expect(components.length).toBeGreaterThan(0)
    const doc = readFileSync(join(root, 'games/CLAUDE.md'), 'utf8')
    expect(components.filter((name) => !APP_ONLY.includes(name) && !doc.includes(`\`${name}\``))).toEqual([])
  })
})
