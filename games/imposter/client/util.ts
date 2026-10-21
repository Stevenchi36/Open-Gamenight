import type { RoomView } from '@wsfg/core/protocol'
import { onUnmounted, ref, watch, type Ref } from 'vue'
import type { ClientAction, ImposterView } from '../shared/index.ts'

/** Props every phase component gets from PlayView. */
export interface PhaseProps {
  view: ImposterView
  room: RoomView
  me: string
  send: (action: ClientAction) => void
  serverNow: () => number
}

export function nameOf(room: RoomView, id: string | null | undefined): string {
  if (!id) return 'Nobody'
  return room.players.find((p) => p.id === id)?.name ?? 'Someone who left'
}

export function isConnected(room: RoomView, id: string): boolean {
  return room.players.find((p) => p.id === id)?.connected ?? false
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
