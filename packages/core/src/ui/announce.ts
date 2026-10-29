// Screen-reader announcements: one polite live region for the whole app (LiveRegion, mounted once
// by the client shell), so anything can say what just happened without moving focus.
import { readonly, ref } from 'vue'

const message = ref('')
let timer: ReturnType<typeof setTimeout> | undefined

/** Read `text` out to screen readers, politely (after whatever they're saying now). */
export function announce(text: string): void {
  clearTimeout(timer)
  // Emptied first and refilled a moment later, so the same words twice in a row are read again.
  message.value = ''
  timer = setTimeout(() => (message.value = text), 100)
}

export const liveMessage = readonly(message)
