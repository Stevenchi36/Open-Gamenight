<template>
  <span v-if="secondsLeft !== null" :class="secondsLeft <= 5 ? 'text-error font-weight-bold' : ''">
    <v-icon size="small">mdi-timer-outline</v-icon> {{ secondsLeft }}s
  </span>
</template>

<script setup lang="ts">
// Seconds left to a server deadline; nothing when there is none. Turns red for the last 5s.
import { useCountdown } from './helpers.ts'

const props = defineProps<{ deadline: number | null; serverNow: () => number }>()
const secondsLeft = useCountdown(() => props.deadline, props.serverNow)
</script>
