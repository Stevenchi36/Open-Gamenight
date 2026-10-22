/**
 * The client-side game manifest. Kept apart from contract.ts so the browser
 * bundle never pulls in Express or node:sqlite types.
 */
import type { Component } from 'vue'
import type { RoomView } from './protocol.ts'
import type { PlayerId } from './contract.ts'

/** Props the room shell passes to a game's PlayView. */
export interface PlayViewProps<V = unknown, A = unknown> {
  view: V
  send: (action: A) => void
  me: PlayerId
  room: RoomView
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

export interface GameClientModule {
  id: string
  name: string
  description: string
  PlayView: () => Promise<Component>
  SettingsView: () => Promise<Component>
  adminPages?: GameAdminPage[]
  /**
   * Whether the game is waiting on this viewer; the shell then shows the "your move" cue.
   * Pure, from the view and room alone. Method syntax so games can type `view` as their own view.
   */
  needsAction?(view: unknown, me: PlayerId, room: RoomView): boolean
}
