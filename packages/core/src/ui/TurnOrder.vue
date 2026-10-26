<template>
  <div class="d-flex flex-wrap ga-1" :class="{ 'justify-center ga-2': large }">
    <v-chip
      v-for="id in order"
      :key="id"
      :size="large ? 'large' : 'small'"
      :color="id === current ? 'primary' : undefined"
      :variant="id === current ? 'flat' : 'tonal'"
      :class="{ 'turn-order--pulse': large && id === current }"
      :prepend-icon="isConnected(room, id) ? undefined : 'mdi-wifi-off'"
    >
      {{ nameOf(room, id) }}{{ id === me ? ' (you)' : '' }}
    </v-chip>
  </div>
</template>

<script setup lang="ts">
// Players as chips in turn order: whose turn it is, who is away, and which one is you.
// `large` is the TV's: bigger chips, and the turn keeps pulsing so it reads from across the room.
import type { PlayerId } from '../contract.ts'
import type { RoomView } from '../protocol.ts'
import { isConnected, nameOf } from './helpers.ts'

defineProps<{ room: RoomView; order: PlayerId[]; current: PlayerId | null; me: PlayerId; large?: boolean }>()
</script>

<style scoped>
.turn-order--pulse {
  animation: turn-order-pulse 1.6s ease-in-out infinite;
}
@keyframes turn-order-pulse {
  50% {
    box-shadow: 0 0 0 8px rgba(var(--v-theme-primary), 0.2);
  }
}
@media (prefers-reduced-motion: reduce) {
  .turn-order--pulse {
    animation: none;
  }
}
</style>
