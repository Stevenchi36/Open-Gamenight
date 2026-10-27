<template>
  <StatusCard :compact="compact" :prominent="!compact" color="primary" :overline="theme.category" :title="theme.text">
    <span class="text-no-wrap">1 = {{ theme.low }}</span> · <span class="text-no-wrap">100 = {{ theme.high }}</span>
  </StatusCard>
</template>

<script setup lang="ts">
import { StatusCard } from '@ogn/core/ui'
import type { Theme } from '../shared/index.ts'

defineProps<{ theme: Theme; compact?: boolean }>()
</script>
