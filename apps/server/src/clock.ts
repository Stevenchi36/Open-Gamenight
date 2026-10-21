/** Time source for rooms and game timers; tests swap in a manual clock. */
export interface TimerHandle {
  cancel(): void
}

export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): TimerHandle
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout(fn, ms) {
    const handle = setTimeout(fn, Math.max(0, ms))
    handle.unref?.()
    return { cancel: () => clearTimeout(handle) }
  },
}
