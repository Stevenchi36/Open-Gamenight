/**
 * localStorage that never throws (private mode, blocked storage).
 *
 * The dev multi-player page (dev-players.html) names each iframe `ogn-p<n>`. Same-origin frames share
 * localStorage, so keys get that name as a prefix to keep each frame's room token and name its own.
 * `window.name` survives in-frame navigation, so no URL plumbing is needed.
 * It lives in core ui so play-view components (CardTable's layout choice) can keep per-player preferences too.
 */
const prefix = /^ogn-p\d+$/.test(window.name) ? `${window.name}:` : ''

export function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(prefix + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(prefix + key)
  } catch {
    // ignore
  }
}
