/**
 * The client-side game manifest. Kept apart from contract.ts so the browser
 * bundle never pulls in Express or node:sqlite types.
 */
import type { Component } from 'vue'
import type { RoomView } from './protocol.ts'
import type { GameMeta, PlayerId } from './contract.ts'

/** Props the room shell passes to a game's PlayView. */
export interface PlayViewProps<V = unknown, A = unknown, Settings = unknown> {
  view: V
  send: (action: A) => void
  me: PlayerId
  room: RoomView
  /** `room.game.settings`, typed. */
  settings: Settings
  /** Server clock in ms (corrected for this device's clock skew), for countdowns against server deadlines. */
  serverNow: () => number
}

/** Props the lobby passes to a game's SettingsView. */
export interface SettingsViewProps<Settings = unknown> {
  settings: Settings
  update: (settings: Settings) => void
  isHost: boolean
}

export interface GameAdminPage {
  /** Relative to /admin/<gameId>/, e.g. 'words'. */
  path: string
  title: string
  component: () => Promise<Component>
}

/** Build with defineGameClient, which checks it against the game's view and settings types. */
export interface GameClientModule<V = unknown, Settings = unknown> extends GameMeta {
  PlayView: () => Promise<Component>
  SettingsView: () => Promise<Component>
  /** The game's player-facing RULES.md (Markdown), lazy-loaded for the shell's "How to play" dialog. */
  rules: () => Promise<string>
  adminPages?: GameAdminPage[]
  /**
   * Whether the game is waiting on this viewer; the shell then shows the "your move" cue.
   * Pure, from the view, room and settings alone.
   */
  needsAction?: (view: V, me: PlayerId, room: RoomView, settings: Settings) => boolean
}

/**
 * Type-checks a game's client module against its own view and settings types, then
 * returns it as a plain GameClientModule for the registry. The shell only ever passes
 * a game the view and settings of that same game, so widening here is sound.
 */
export function defineGameClient<V, Settings>(module: GameClientModule<V, Settings>): GameClientModule {
  return module as GameClientModule
}
