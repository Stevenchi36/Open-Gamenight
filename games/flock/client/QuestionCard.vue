<template>
  <StatusCard :compact="compact" :prominent="!compact" color="primary" :overline="question.category" :title="question.text">
    <CountdownTimer v-if="deadline" :deadline="deadline" :server-now="serverNow" />
  </StatusCard>
</template>

<script setup lang="ts">
import { CountdownTimer, StatusCard } from '@ogn/core/ui'

defineProps<{
  question: { text: string; category: string }
  deadline?: number | null
  serverNow: () => number
  compact?: boolean
}>()
</script>
