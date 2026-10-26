<template>
  <v-row dense class="mb-3">
    <v-col v-for="id in players" :key="id" cols="6" sm="4">
      <v-card
        :color="selected === id ? 'primary' : undefined"
        :variant="selected === id ? 'flat' : 'tonal'"
        :disabled="disabled"
        class="text-center"
        @click="emit('pick', id)"
      >
        <v-card-text class="py-5">
          <v-icon v-if="selected === id" class="mb-1">mdi-check-circle</v-icon>
          <div class="text-body-large font-weight-medium">{{ nameOf(room, id) }}</div>
          <div v-if="$slots.caption" class="text-body-small"><slot name="caption" :id="id" /></div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
// A grid of big player cards to tap (vote for, target, pick); the selected one is filled.
import type { PlayerId } from '../contract.ts'
import type { RoomView } from '../protocol.ts'
import { nameOf } from './helpers.ts'

defineProps<{ room: RoomView; players: PlayerId[]; selected: PlayerId | null; disabled?: boolean }>()
const emit = defineEmits<{ pick: [id: PlayerId] }>()
defineSlots<{ caption?(props: { id: PlayerId }): unknown }>()
</script>
