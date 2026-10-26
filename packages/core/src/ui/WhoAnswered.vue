<template>
  <div class="mb-4">
    <div :class="large ? 'text-h6' : 'text-body-2'" class="mb-2 text-center">{{ done.length }} / {{ players.length }} {{ label }}</div>
    <div class="d-flex justify-center flex-wrap ga-2">
      <v-chip
        v-for="id in players"
        :key="id"
        :size="large ? 'large' : 'default'"
        :color="done.includes(id) ? 'success' : undefined"
        :variant="done.includes(id) ? 'flat' : 'tonal'"
        :class="{ 'who-answered--pop': popped.includes(id) }"
        :prepend-icon="done.includes(id) ? 'mdi-check' : isConnected(room, id) ? 'mdi-timer-sand' : 'mdi-wifi-off'"
      >
        {{ nameOf(room, id) }}
      </v-chip>
    </div>
  </div>
</template>

<script setup lang="ts">
// Who has answered, never what: a chip per player that turns green with a small pop when they
// do, and a count. For a TV, where the room watches the last few holdouts. The first render
// shows things as they stand, so opening the TV mid-round pops nothing.
import { ref, watch } from 'vue'
import type { PlayerId } from '../contract.ts'
import type { RoomView } from '../protocol.ts'
import { isConnected, nameOf } from './helpers.ts'

const props = defineProps<{
  room: RoomView
  /** Everyone expected to answer, in the order to show. */
  players: PlayerId[]
  done: PlayerId[]
  /** "answered", "guessed", "bet". */
  label: string
  large?: boolean
}>()

const popped = ref<PlayerId[]>([])
watch(
  () => props.done,
  (now, before) => {
    popped.value = now.filter((id) => !before.includes(id))
  },
)
</script>

<style scoped>
.who-answered--pop {
  animation: who-answered-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes who-answered-pop {
  from {
    transform: scale(0.7);
  }
}
@media (prefers-reduced-motion: reduce) {
  .who-answered--pop {
    animation: none;
  }
}
</style>
