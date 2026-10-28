/** Public server config (/api/config): branding, games, whether AI features exist, whether guests may create rooms. */
import type { AvailableGame } from '@ogn/core/protocol'
import { reactive } from 'vue'

export interface AppConfig {
  appName: string
  primaryColor: string
  aiEnabled: boolean
  /** ROOM_CREATION=anyone: guests may start rooms too. */
  guestRooms: boolean
  games: AvailableGame[]
}

export const config = reactive<AppConfig>({
  appName: 'Open Gamenight',
  primaryColor: '#6750A4',
  aiEnabled: false,
  guestRooms: false,
  games: [],
})

export async function loadConfig(): Promise<AppConfig> {
  try {
    const res = await fetch('/api/config')
    if (res.ok) Object.assign(config, (await res.json()) as AppConfig)
  } catch {
    // offline or server down: keep defaults; the room store will show the connection state
  }
  return config
}
