<template>
  <div class="mb-4">
    <div class="d-flex align-center text-body-medium mb-1">
      <span>Rotation {{ view.turn.rotation }} of {{ view.turn.totalRotations }}</span>
      <v-spacer />
      <CountdownTimer :deadline="view.turn.deadline" :server-now="serverNow" />
    </div>
    <v-progress-linear :model-value="progress" color="primary" rounded height="6" class="mb-3" />
    <TurnOrder :room="room" :order="view.turn.order" :current="view.turn.currentPlayerId" :me="me" />
  </div>
</template>

<script setup lang="ts">
import { CountdownTimer, TurnOrder } from '@ogn/core/ui'
import { computed } from 'vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const progress = computed(() => {
  const { order, currentPlayerId, rotation, totalRotations } = props.view.turn
  if (order.length === 0) return 0
  const done = (rotation - 1) * order.length + Math.max(0, order.indexOf(currentPlayerId ?? ''))
  return (done / (order.length * totalRotations)) * 100
})
</script>
