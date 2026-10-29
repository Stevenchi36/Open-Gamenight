/**
 * Which games players can pick. An admin turns games off on the Games page;
 * the ids live in core `disabled_games` and are cached here, since only this
 * process writes them and room views read them on every broadcast.
 * Off only hides a game from new rooms and the lobby switcher: its migrations,
 * library, admin pages and MCP tools stay, so turning it back on just works.
 */
import type { DatabaseSync } from 'node:sqlite'
import type { AnyGameModule } from '@ogn/core/contract'

export class GameAvailabilityError extends Error {
  readonly code: 'not_found' | 'last_game'
  constructor(code: GameAvailabilityError['code'], message: string) {
    super(message)
    this.code = code
  }
}

export interface GameAvailability {
  isEnabled(gameId: string): boolean
  /** Registry order, so the first one is the default game for new rooms. */
  enabled(): AnyGameModule[]
  /** Throws GameAvailabilityError for an unknown id or when it would turn off the last game. */
  set(gameId: string, enabled: boolean): void
}

export function createGameAvailability(db: DatabaseSync, games: readonly AnyGameModule[]): GameAvailability {
  const rows = db.prepare('SELECT game_id FROM disabled_games').all() as { game_id: string }[]
  // Rows for games no longer in the registry are ignored, not deleted, in case the game comes back.
  const disabled = new Set(rows.map((r) => r.game_id))
  const isEnabled = (gameId: string) => games.some((g) => g.id === gameId) && !disabled.has(gameId)
  const enabled = () => games.filter((g) => !disabled.has(g.id))

  return {
    isEnabled,
    enabled,
    set(gameId, on) {
      if (!games.some((g) => g.id === gameId)) throw new GameAvailabilityError('not_found', 'Unknown game')
      if (on) {
        db.prepare('DELETE FROM disabled_games WHERE game_id = ?').run(gameId)
        disabled.delete(gameId)
        return
      }
      if (enabled().every((g) => g.id === gameId)) throw new GameAvailabilityError('last_game', 'At least one game has to stay on')
      db.prepare('INSERT OR IGNORE INTO disabled_games (game_id) VALUES (?)').run(gameId)
      disabled.add(gameId)
    },
  }
}
