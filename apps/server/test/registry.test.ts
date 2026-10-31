import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { assertValidRegistry } from '@ogn/core/contract'
import { clientGames } from '@ogn/games/client'
import { games } from '@ogn/games/server'
import { describe, expect, it } from 'vitest'

const gamesDir = join(import.meta.dirname, '../../../games')
const folders = readdirSync(gamesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
  .map((entry) => entry.name)

const metaOf = (g: { id: string; name: string; description: string; styles: readonly string[]; minPlayers: number; maxPlayers: number }) => ({
  id: g.id,
  name: g.name,
  description: g.description,
  styles: g.styles,
  minPlayers: g.minPlayers,
  maxPlayers: g.maxPlayers,
})

/** A game's .ts and .vue files, as paths relative to its folder. */
function sourceFiles(folder: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(path)
      } else if (/\.(ts|vue)$/.test(entry.name)) out.push(relative(join(gamesDir, folder), path))
    }
  }
  walk(join(gamesDir, folder))
  return out
}

describe('game registries', () => {
  it('is a valid server registry', () => {
    expect(() => assertValidRegistry(games)).not.toThrow()
  })

  it('lists the same games, in the same order, with the same metadata on server and client', () => {
    expect(clientGames.map(metaOf)).toEqual(games.map(metaOf))
  })

  it('registers every game folder, under its folder name', () => {
    expect(games.map((g) => g.id).sort()).toEqual([...folders].sort())
  })
})

// The "every game ships" list in games/CLAUDE.md, checked so a game (or later a community game) can't skip it.
describe.each(folders)('game %s ships', (folder) => {
  const client = clientGames.find((g) => g.id === folder)

  it('DESIGN.md with a Watch page section, and RULES.md', () => {
    expect(existsSync(join(gamesDir, folder, 'RULES.md'))).toBe(true)
    expect(readFileSync(join(gamesDir, folder, 'DESIGN.md'), 'utf8')).toMatch(/Watch page/)
  })

  it('a client module with rules, needsAction and a SpectatorView', () => {
    expect(client).toBeDefined()
    expect(typeof client?.rules).toBe('function')
    expect(typeof client?.needsAction).toBe('function')
    expect(typeof client?.SpectatorView).toBe('function')
  })

  it('screen-reader announcements in its PlayView', () => {
    expect(readFileSync(join(gamesDir, folder, 'client/PlayView.vue'), 'utf8')).toMatch(/\buseAnnounce\(/)
  })

  // Lint blocks other @ogn packages and apps/ or packages/ paths; only resolving finds a
  // relative path that climbs out into another game.
  it('imports nothing from outside its folder but @ogn/core and npm packages', () => {
    const root = join(gamesDir, folder)
    const escapes: string[] = []
    for (const file of sourceFiles(folder)) {
      const source = readFileSync(join(root, file), 'utf8')
      for (const [, spec] of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)'([^']+)'/gm)) {
        if (!spec!.startsWith('.')) continue
        const target = relative(root, resolve(root, dirname(file), spec!))
        if (target.startsWith('..')) escapes.push(`${file}: ${spec}`)
      }
    }
    expect(escapes).toEqual([])
  })
})
