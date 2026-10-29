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
 * view with the one before and returns the words, or null. Not on first render, so joining or
 * reconnecting mid-game reads nothing out (like the move animations), except what `first` returns
 * for the view on screen then: a party game's opening prompt, when the game has just started.
 */
export function useAnnounce<V>(view: () => V, describe: (now: V, before: V) => string | null, first?: (now: V) => string | null): void {
  const opening = first?.(view())
  if (opening) announce(opening)
  watch(view, (now, before) => {
    const text = describe(now, before)
    if (text) announce(text)
  })
}

/**
 * Who has just finished something, from the list of who's done: "Sam answered, 3 of 5", or
 * "Sam and Bea answered, 4 of 5"; null when nobody new. `done` words it ("Sam answered"), given
 * the names ("You" for `me`) and how many they are.
 */
export function progressText(
  now: readonly string[],
  before: readonly string[],
  total: number,
  done: (who: string, count: number) => string,
  me: string,
  name: (id: string) => string,
): string | null {
  // You first, so it's never a capitalised "You" mid-sentence.
  const fresh = now.filter((id) => !before.includes(id)).sort((a, b) => Number(b === me) - Number(a === me))
  if (fresh.length === 0) return null
  const names = fresh.map((id) => (id === me ? 'You' : name(id)))
  const who = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `${done(who, names.length)}, ${now.length} of ${total}`
}
