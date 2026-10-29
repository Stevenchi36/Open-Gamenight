<template>
  <div class="dice-seats mb-4">
    <v-card
      v-for="seat in seats"
      :key="seat.id"
      :color="seat.id === turn ? 'primary' : undefined"
      :variant="seat.id === turn ? 'flat' : 'tonal'"
      :class="{ 'dice-seat--turn': seat.id === turn, 'dice-seat--out': seat.dice === 0 }"
    >
      <v-card-text class="text-center">
        <div class="text-title-large text-truncate">
          <v-icon v-if="!isConnected(room, seat.id)" size="small" class="mr-1">mdi-wifi-off</v-icon>{{ nameOf(room, seat.id) }}
        </div>
        <div v-if="seat.dice === 0" class="text-body-large mt-1">Out</div>
        <div v-else class="d-flex justify-center flex-wrap ga-1 mt-1" role="img" :aria-label="seat.dice === 1 ? '1 die' : `${seat.dice} dice`">
          <v-icon v-for="n in seat.dice" :key="n" size="32">mdi-dice-d6</v-icon>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
// The TV's seats: a card per player in turn order with their dice as hidden cups, never faces.
// The turn's card keeps pulsing, as it's watched from across the room.
import type { PlayerId } from '@ogn/core/contract'
import type { RoomView } from '@ogn/core/protocol'
import { isConnected, nameOf } from '@ogn/core/ui'
import type { Seat } from '../shared/index.ts'

defineProps<{ seats: Seat[]; turn: PlayerId | null; room: RoomView }>()
</script>

<style scoped>
.dice-seats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.dice-seat--out {
  opacity: 0.45;
}
.dice-seat--turn {
  animation: dice-seat-pulse 1.6s ease-in-out infinite;
}
@keyframes dice-seat-pulse {
  50% {
    box-shadow: 0 0 0 8px rgba(var(--v-theme-primary), 0.2);
  }
}
@media (prefers-reduced-motion: reduce) {
  .dice-seat--turn {
    animation: none;
  }
}
</style>
