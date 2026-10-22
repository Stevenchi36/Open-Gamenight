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
