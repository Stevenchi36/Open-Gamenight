import type { AvailableGame } from '@ogn/core/protocol'

/** "2-6", or "4" when a game takes exactly one count. */
export function playerRange(game: Pick<AvailableGame, 'minPlayers' | 'maxPlayers'>): string {
  return game.minPlayers === game.maxPlayers ? `${game.minPlayers}` : `${game.minPlayers}-${game.maxPlayers}`
}

/** A game picker's item title: "Gone Fishin' (2-6)". */
export function gameTitle(game: Pick<AvailableGame, 'name' | 'minPlayers' | 'maxPlayers'>): string {
  return `${game.name} (${playerRange(game)})`
}
