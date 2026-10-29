// Screen-reader announcements: one polite live region for the whole app (LiveRegion, mounted once
// by the client shell), so anything can say what just happened without moving focus.
import { readonly, ref, watch } from 'vue'

const message = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let first: string[] = []
let last: string[] = []

/**
 * Read `text` out to screen readers, politely (after whatever they're saying now). Texts announced
 * together (one state update: a move, then "Your move") are read as one message, `last` ones at the
 * end, so a later one doesn't cut off an earlier one.
 */
export function announce(text: string, options: { last?: boolean } = {}): void {
  ;(options.last ? last : first).push(/[.!?]$/.test(text) ? text : `${text}.`)
  if (timer !== undefined) return
  // Emptied first and refilled a moment later, so the same words twice in a row are read again.
  message.value = ''
  timer = setTimeout(() => {
    message.value = [...new Set([...first, ...last])].join(' ')
    first = []
    last = []
    timer = undefined
  }, 100)
}

export const liveMessage = readonly(message)

/**
 * Announce what changed as each new view arrives, e.g. the newest move: `describe` compares the
 * view with the one before and returns the words, or null. Never on first render, so joining or
 * reconnecting mid-game reads nothing out (like the move animations).
 */
export function useAnnounce<V>(view: () => V, describe: (now: V, before: V) => string | null): void {
  watch(view, (now, before) => {
    const text = describe(now, before)
    if (text) announce(text)
  })
}
