<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      Players
      <v-chip size="small" class="ml-2" variant="tonal">{{ room.players.length }}</v-chip>
    </v-card-title>
    <v-card-text class="d-flex flex-wrap ga-3">
      <v-chip
        v-for="p in room.players"
        :key="p.id"
        size="x-large"
        :variant="p.connected ? 'tonal' : 'outlined'"
        :color="p.connected ? 'primary' : undefined"
        :prepend-icon="p.isHost ? 'mdi-crown' : p.connected ? 'mdi-account' : 'mdi-wifi-off'"
      >
        {{ p.name }}
      </v-chip>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
// The watch page's player list, sized to read from across a room.
import type { RoomView } from '@ogn/core/protocol'

defineProps<{ room: RoomView }>()
</script>
