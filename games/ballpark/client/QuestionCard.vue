<template>
  <StatusCard :compact="compact" :prominent="!compact" color="primary" :overline="question.category" :title="question.text">
    <div v-if="question.unit" class="text-body-medium">Answer in {{ question.unit }}</div>
    <CountdownTimer v-if="deadline" :deadline="deadline" :server-now="serverNow" />
  </StatusCard>
</template>

<script setup lang="ts">
import { CountdownTimer, StatusCard } from '@wsfg/core/ui'

defineProps<{
  question: { text: string; category: string; unit: string | null }
  deadline?: number | null
  serverNow: () => number
  compact?: boolean
}>()
</script>
