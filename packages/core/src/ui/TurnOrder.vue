<template>
  <div class="d-flex flex-wrap ga-1">
    <v-chip
      v-for="id in order"
      :key="id"
      size="small"
      :color="id === current ? 'primary' : undefined"
      :variant="id === current ? 'flat' : 'tonal'"
      :prepend-icon="isConnected(room, id) ? undefined : 'mdi-wifi-off'"
    >
      {{ nameOf(room, id) }}{{ id === me ? ' (you)' : '' }}
    </v-chip>
  </div>
</template>

<script setup lang="ts">
// Players as chips in turn order: whose turn it is, who is away, and which one is you.
import type { PlayerId } from '../contract.ts'
import type { RoomView } from '../protocol.ts'
import { isConnected, nameOf } from './helpers.ts'

defineProps<{ room: RoomView; order: PlayerId[]; current: PlayerId | null; me: PlayerId }>()
</script>
