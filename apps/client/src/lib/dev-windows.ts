/**
 * Dev only: opens a new room straight into the dev-players grid and/or a watch (TV) window.
 * Every caller sits under `import.meta.env.DEV`, so production builds drop this module.
 */

export interface DevLaunch {
  players: boolean
  count: number
  watch: boolean
}

export const devLaunchDefaults = (): DevLaunch => ({ players: false, count: 3, watch: false })

/** The dev-players page, always on localhost: P1 shares the sign-in there, guests use another host (see dev-players.html). */
export function devPlayersUrl(count: number, code: string): string {
  const params = new URLSearchParams({ n: String(count) })
  const room = code.trim().toUpperCase()
  if (room) params.set('code', room)
  const origin = location.hostname === 'localhost' ? location.origin : `${location.protocol}//localhost:${location.port}`
  return `${origin}/dev-players.html?${params}`
}

export interface DevWindows {
  /** Point the windows at the created room. */
  show(code: string): void
  /** Room creation failed: close the blank windows. */
  close(): void
  /** True if the browser blocked a window (pop-ups not allowed for this site). */
  blocked: boolean
}

/**
 * Opens the windows blank, synchronously in the click handler, so they still count as opened by the
 * user; they navigate once the room exists. Chrome allows one pop-up per click unless pop-ups are
 * allowed for the site, so asking for both windows needs that permission. Named windows are reused
 * on the next launch rather than piling up.
 */
export function openDevWindows(launch: DevLaunch): DevWindows | null {
  if (!launch.players && !launch.watch) return null
  const { availWidth: w, availHeight: h } = screen
  const both = launch.players && launch.watch
  const playersWidth = both ? Math.round(w * 0.62) : w
  const watchWidth = both ? w - playersWidth : Math.round(w * 0.6)
  const features = (width: number, height: number, left: number) =>
    `popup,width=${width},height=${height},left=${left},top=0`

  const players = launch.players ? window.open('about:blank', 'wsfg-dev-players', features(playersWidth, h, 0)) : null
  const watch = launch.watch
    ? window.open('about:blank', 'wsfg-dev-watch', features(watchWidth, Math.round((watchWidth * 9) / 16), both ? playersWidth : 0))
    : null

  return {
    blocked: (launch.players && !players) || (launch.watch && !watch),
    show(code) {
      players?.location.replace(devPlayersUrl(launch.count, code))
      watch?.location.replace(`${location.origin}/watch/${encodeURIComponent(code)}`)
    },
    close() {
      players?.close()
      watch?.close()
    },
  }
}
