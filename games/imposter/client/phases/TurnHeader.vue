<template>
  <div class="mb-4">
    <div class="d-flex align-center text-body-2 mb-1">
      <span>Rotation {{ view.turn.rotation }} of {{ view.turn.totalRotations }}</span>
      <v-spacer />
      <span v-if="secondsLeft !== null" :class="secondsLeft <= 5 ? 'text-error font-weight-bold' : ''">
        <v-icon size="small">mdi-timer-outline</v-icon> {{ secondsLeft }}s
      </span>
    </div>
    <v-progress-linear :model-value="progress" color="primary" rounded height="6" />
    <div class="d-flex flex-wrap ga-1 mt-3">
      <v-chip
        v-for="id in view.turn.order"
        :key="id"
        size="small"
        :color="id === view.turn.currentPlayerId ? 'primary' : undefined"
        :variant="id === view.turn.currentPlayerId ? 'flat' : 'tonal'"
        :prepend-icon="isConnected(room, id) ? undefined : 'mdi-wifi-off'"
      >
        {{ nameOf(room, id) }}{{ id === me ? ' (you)' : '' }}
      </v-chip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isConnected, nameOf, useCountdown } from '@wsfg/core/ui'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const secondsLeft = useCountdown(() => props.view.turn.deadline, props.serverNow)
const progress = computed(() => {
  const { order, currentPlayerId, rotation, totalRotations } = props.view.turn
  if (order.length === 0) return 0
  const done = (rotation - 1) * order.length + Math.max(0, order.indexOf(currentPlayerId ?? ''))
  return (done / (order.length * totalRotations)) * 100
})
</script>
