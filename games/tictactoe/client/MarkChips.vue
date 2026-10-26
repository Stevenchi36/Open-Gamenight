<template>
  <div class="d-flex justify-center flex-wrap ga-2 mb-4">
    <v-chip
      v-for="mark in MARKS"
      :key="mark"
      :size="size"
      :color="view.turn === view.marks[mark] ? 'primary' : undefined"
      :variant="view.turn === view.marks[mark] ? 'flat' : 'tonal'"
      :class="{ 'turn-pulse': size === 'large' && view.turn === view.marks[mark] }"
      :prepend-icon="isConnected(room, view.marks[mark]) ? MARK_ICONS[mark] : 'mdi-wifi-off'"
    >
      {{ nameOf(room, view.marks[mark]) }}{{ view.marks[mark] === me ? ' (you)' : '' }}
      <strong class="ml-2">{{ view.scores[view.marks[mark]] ?? 0 }}</strong>
    </v-chip>
  </div>
</template>

<script setup lang="ts">
// A chip per mark: who plays it and their score; the turn is highlighted.
import type { PlayerId } from '@wsfg/core/contract'
import type { RoomView } from '@wsfg/core/protocol'
import { isConnected, nameOf } from '@wsfg/core/ui'
import type { Mark, TicTacToeView } from '../shared/index.ts'

defineProps<{ view: TicTacToeView; room: RoomView; me: PlayerId; size?: 'default' | 'large' }>()

const MARKS: Mark[] = ['X', 'O']
const MARK_ICONS: Record<Mark, string> = { X: 'mdi-close', O: 'mdi-circle-outline' }
</script>

<style scoped>
/* Large chips are the TV's: watched from across the room, so the turn keeps pulsing. */
.turn-pulse {
  animation: turn-pulse 1.6s ease-in-out infinite;
}
@keyframes turn-pulse {
  50% {
    box-shadow: 0 0 0 8px rgba(var(--v-theme-primary), 0.2);
  }
}
@media (prefers-reduced-motion: reduce) {
  .turn-pulse {
    animation: none;
  }
}
</style>
