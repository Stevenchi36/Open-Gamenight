// The last line move this player sent. OrderList reads your own moves out as you make them, so
// when the server's echo of one arrives, the play view's announcement skips it.
let last: { id: string; to: number } | null = null

export function noteOwnMove(id: string, to: number): void {
  last = { id, to }
}

/** Whether this move is the one you just sent (each is matched once). */
export function isOwnMove(id: string, to: number): boolean {
  const own = last?.id === id && last.to === to
  if (own) last = null
  return own
}
