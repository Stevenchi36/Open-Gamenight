<template>
  <div class="d-flex justify-center flex-wrap ga-2 mb-4">
    <v-chip
      v-for="(seat, i) in view.seats"
      :key="seat.id"
      :size="size"
      :color="view.turn === seat.id ? 'primary' : undefined"
      :variant="view.turn === seat.id ? 'flat' : 'tonal'"
      :disabled="seat.left"
      :prepend-icon="seat.left ? 'mdi-logout' : isConnected(room, seat.id) ? undefined : 'mdi-wifi-off'"
    >
      <span class="db-dot mr-2" :style="{ background: seatColor(i) }" />
      {{ nameOf(room, seat.id) }}{{ seat.id === me ? ' (you)' : '' }}
      <strong class="ml-2" :aria-label="`${seat.boxes} boxes`">{{ seat.boxes }}</strong>
    </v-chip>
  </div>
</template>

<script setup lang="ts">
// A chip per seat in turn order: colour, name and boxes this game. Leavers are dimmed.
import type { PlayerId } from '@wsfg/core/contract'
import type { RoomView } from '@wsfg/core/protocol'
import { isConnected, nameOf } from '@wsfg/core/ui'
import type { DotsView } from '../shared/index.ts'
import { seatColor } from './text.ts'

defineProps<{ view: DotsView; room: RoomView; me: PlayerId; size?: 'default' | 'large' }>()
</script>

<style scoped>
.db-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
</style>
