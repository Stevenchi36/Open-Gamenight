import { onUnmounted, ref, watch, type Ref } from 'vue'
import type { PlayerId } from '../contract.ts'
import type { RoomView } from '../protocol.ts'

export function nameOf(room: RoomView, id: PlayerId | null | undefined): string {
  if (!id) return 'Nobody'
  return room.players.find((p) => p.id === id)?.name ?? 'Someone who left'
}

export function isConnected(room: RoomView, id: PlayerId): boolean {
  return room.players.find((p) => p.id === id)?.connected ?? false
}

export function isHost(room: RoomView, id: PlayerId): boolean {
  return room.hostId === id
}

/** 1st, 2nd, 3rd, 4th, ... 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** Seconds left until a server deadline, ticking. null when there is no deadline. */
export function useCountdown(deadline: () => number | null, serverNow: () => number): Ref<number | null> {
  const left = ref<number | null>(null)
  const tick = () => {
    const d = deadline()
    left.value = d === null ? null : Math.max(0, Math.ceil((d - serverNow()) / 1000))
  }
  const timer = setInterval(tick, 250)
  watch(deadline, tick, { immediate: true })
  onUnmounted(() => clearInterval(timer))
  return left
}

/** One row of `MoveLog`. */
export interface MoveLogEntry {
  /** The move's number in the game, from 1. */
  n: number
  text: string
  /** How it went for the player who made it: paid off, didn't, or neither. */
  tone?: 'success' | 'error' | null
}

/**
 * A move log (oldest first) as `MoveLog` rows, newest first and numbered from the first move.
 * `skipLatest` leaves out the newest when it's already shown big; `max` caps the rows.
 */
export function moveLogEntries<M>(
  log: readonly M[],
  text: (move: M) => string,
  tone: (move: M) => MoveLogEntry['tone'],
  { skipLatest = false, max = Infinity }: { skipLatest?: boolean; max?: number } = {},
): MoveLogEntry[] {
  const upTo = skipLatest ? log.length - 1 : log.length
  const out: MoveLogEntry[] = []
  for (let i = upTo - 1; i >= 0 && out.length < max; i--) out.push({ n: i + 1, text: text(log[i]!), tone: tone(log[i]!) })
  return out
}
