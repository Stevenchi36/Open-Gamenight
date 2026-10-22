<template>
  <div class="d-flex flex-wrap ga-1 mb-4">
    <v-chip
      v-for="seat in seats"
      :key="seat.id"
      size="small"
      :color="seat.id === turn ? 'primary' : undefined"
      :variant="seat.id === turn ? 'flat' : 'tonal'"
      :disabled="seat.dice === 0"
      :prepend-icon="isConnected(room, seat.id) ? undefined : 'mdi-wifi-off'"
    >
      {{ nameOf(room, seat.id) }}{{ seat.id === me ? ' (you)' : '' }}
      <span class="ml-2 d-inline-flex align-center">
        <v-icon size="small" class="mr-1">mdi-dice-multiple</v-icon>{{ seat.dice === 0 ? 'out' : seat.dice }}
      </span>
    </v-chip>
  </div>
</template>

<script setup lang="ts">
// Players in seat order (turns go this way) with how many dice each has left.
import type { PlayerId } from '@wsfg/core/contract'
import type { RoomView } from '@wsfg/core/protocol'
import { isConnected, nameOf } from '@wsfg/core/ui'
import type { Seat } from '../shared/index.ts'

defineProps<{ seats: Seat[]; turn: PlayerId | null; me: PlayerId; room: RoomView }>()
</script>
