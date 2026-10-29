<template>
  <v-row dense class="mb-3">
    <v-col v-for="id in players" :key="id" cols="6" sm="4">
      <v-card
        tag="button"
        type="button"
        :color="selected === id ? 'primary' : undefined"
        :variant="selected === id ? 'flat' : 'tonal'"
        :disabled="disabled"
        :aria-disabled="disabled || undefined"
        :aria-pressed="selected === id"
        class="player-pick text-center"
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
// Real buttons: a v-card with @click alone can't be reached by keyboard or screen reader.
import type { PlayerId } from '../contract.ts'
import type { RoomView } from '../protocol.ts'
import { nameOf } from './helpers.ts'

defineProps<{ room: RoomView; players: PlayerId[]; selected: PlayerId | null; disabled?: boolean }>()
const emit = defineEmits<{ pick: [id: PlayerId] }>()
defineSlots<{ caption?(props: { id: PlayerId }): unknown }>()
</script>

<style scoped>
.player-pick {
  display: block;
  width: 100%;
  padding: 0;
  font: inherit;
}
.player-pick:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
</style>
