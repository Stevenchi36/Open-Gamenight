import { assertValidRegistry } from '@wsfg/core/contract'
import { clientGames } from '@wsfg/games/client'
import { games } from '@wsfg/games/server'
import { describe, expect, it } from 'vitest'

const metaOf = (g: { id: string; name: string; description: string; styles: readonly string[]; minPlayers: number; maxPlayers: number }) => ({
  id: g.id,
  name: g.name,
  description: g.description,
  styles: g.styles,
  minPlayers: g.minPlayers,
  maxPlayers: g.maxPlayers,
})

describe('game registries', () => {
  it('is a valid server registry', () => {
    expect(() => assertValidRegistry(games)).not.toThrow()
  })

  it('lists the same games, in the same order, with the same metadata on server and client', () => {
    expect(clientGames.map(metaOf)).toEqual(games.map(metaOf))
  })
})
