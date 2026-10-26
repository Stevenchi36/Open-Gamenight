<template>
  <div class="d-flex justify-center flex-wrap ga-2 mb-4">
    <v-chip
      v-for="disc in DISCS"
      :key="disc"
      :size="size"
      :color="view.turn === view.discs[disc] ? 'primary' : undefined"
      :variant="view.turn === view.discs[disc] ? 'flat' : 'tonal'"
      :class="{ 'turn-pulse': size === 'large' && view.turn === view.discs[disc] }"
      :prepend-icon="isConnected(room, view.discs[disc]) ? undefined : 'mdi-wifi-off'"
    >
      <span class="dl-dot mr-2" :class="`dl-dot--${disc}`" />
      {{ nameOf(room, view.discs[disc]) }}{{ view.discs[disc] === me ? ' (you)' : '' }}
      <strong class="ml-2">{{ view.scores[view.discs[disc]] ?? 0 }}</strong>
    </v-chip>
  </div>
</template>

<script setup lang="ts">
// A chip per colour: who plays it and their score; the turn is highlighted.
import type { PlayerId } from '@wsfg/core/contract'
import type { RoomView } from '@wsfg/core/protocol'
import { isConnected, nameOf } from '@wsfg/core/ui'
import type { Disc, DropLineView } from '../shared/index.ts'

defineProps<{ view: DropLineView; room: RoomView; me: PlayerId; size?: 'default' | 'large' }>()

const DISCS: Disc[] = ['red', 'blue']
</script>

<style scoped>
.dl-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.dl-dot--red {
  background: #e53935;
}
.dl-dot--blue {
  background: #1e88e5;
}
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
