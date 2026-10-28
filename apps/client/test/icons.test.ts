import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { icons } from '../src/plugins/icons.ts'

const root = join(import.meta.dirname, '../../..')
const dirs = ['apps/client/src', 'games', 'packages/core/src']

/** Every mdi-* name in client-side source; a name ending in '-' is the prefix of a built name (`mdi-dice-${n}`). */
function usedNames(): Set<string> {
  const names = new Set<string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(path)
      } else if (/\.(vue|ts)$/.test(entry.name)) {
        // (?<!\/) skips import paths such as vuetify/iconsets/mdi-svg
        for (const [name] of readFileSync(path, 'utf8').matchAll(/(?<!\/)mdi-[a-z0-9-]+/g)) names.add(name)
      }
    }
  }
  for (const dir of dirs) walk(join(root, dir))
  return names
}

describe('icons', () => {
  it('maps every mdi-* name the code uses', () => {
    const missing = [...usedNames()].filter((name) => (name.endsWith('-') ? false : !(name in icons)))
    expect(missing).toEqual([])
  })

  it('maps every icon a built name can produce', () => {
    // Liar's Dice: `mdi-dice-${face}`
    for (const face of [1, 2, 3, 4, 5, 6]) expect(icons[`mdi-dice-${face}`]).toBeTruthy()
    const prefixes = [...usedNames()].filter((name) => name.endsWith('-'))
    expect(prefixes).toEqual(['mdi-dice-'])
  })
})
