<template>
  <template v-if="isHost(room, me)">
    <slot name="options" />
    <v-btn block size="x-large" color="primary" prepend-icon="mdi-replay" @click="emit('next')">{{ label }}</v-btn>
  </template>
  <div v-else class="text-center text-body-large text-medium-emphasis">Waiting for {{ nameOf(room, room.hostId) }} {{ waitingFor }}.</div>
</template>

<script setup lang="ts">
// End of a round: the host gets the button (plus any host-only options), everyone else sees who they're waiting on.
import type { PlayerId } from '../contract.ts'
import type { RoomView } from '../protocol.ts'
import { isHost, nameOf } from './helpers.ts'

withDefaults(defineProps<{ room: RoomView; me: PlayerId; label?: string; waitingFor?: string }>(), {
  label: 'Play again',
  waitingFor: 'to start the next round',
})
const emit = defineEmits<{ next: [] }>()
</script>
