/** The browser tab title: "<page> - <app name>", worked out from the route and the room in one place. */
import { SPECTATOR_ID } from '@ogn/core/protocol'
import { clientGames } from '@ogn/games/client'
import { watchEffect } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { config } from './config.ts'
import { roomState } from './room.ts'

const gameName = (id: string) => config.games.find((g) => g.id === id)?.name ?? clientGames.find((g) => g.id === id)?.name ?? id

function roomTitle(code: string, watching: boolean): string {
  const r = roomState.room
  // Only once this page's room has arrived, and as the right kind of viewer.
  if (!r || r.code !== code || (r.you.id === SPECTATOR_ID) !== watching) return watching ? `Watch ${code}` : `Join ${code}`
  const name = gameName(r.game.id)
  if (watching) return `Watching ${name}`
  return r.phase === 'playing' ? name : `${name} lobby`
}

function adminTitle(route: RouteLocationNormalizedLoaded): string {
  const gameId = String(route.params.gameId ?? '')
  switch (route.name) {
    case 'admin-users':
      return 'Users'
    case 'admin-rooms':
      return 'Rooms'
    case 'admin-games':
      return 'Games'
    case 'admin-chat':
      return 'Assistant'
    case 'admin-categories':
      return `${gameName(gameId)}: Categories`
    case 'admin-game': {
      const page = clientGames.find((g) => g.id === gameId)?.adminPages?.find((p) => p.path === route.params.page)
      return `${gameName(gameId)}: ${page?.title ?? String(route.params.page)}`
    }
    default:
      return ''
  }
}

export function pageTitle(route: RouteLocationNormalizedLoaded): string {
  const code = String(route.params.code ?? '').toUpperCase()
  switch (route.name) {
    case 'home':
      return route.query.tab === 'library' ? 'Game Library' : ''
    case 'login':
      return 'Sign in'
    case 'room':
      return roomTitle(code, false)
    case 'watch':
      return code ? roomTitle(code, true) : 'Watch a room'
    default: {
      if (!route.path.startsWith('/admin')) return ''
      const page = adminTitle(route)
      return page ? `${page} - Admin` : 'Admin'
    }
  }
}

export function useDocumentTitle(route: RouteLocationNormalizedLoaded): void {
  watchEffect(() => {
    const page = pageTitle(route)
    document.title = page ? `${page} - ${config.appName}` : config.appName
  })
}
