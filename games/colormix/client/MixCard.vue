<template>
  <StatusCard :compact="compact" :prominent="!compact" color="primary" overline="Mix these in equal parts">
    <div class="d-flex flex-wrap align-center justify-center ga-2 my-2">
      <template v-for="(color, i) in colors" :key="i">
        <span v-if="i > 0" class="text-h6 text-medium-emphasis">+</span>
        <ColorDot :color="color" :size="dotSize" />
      </template>
      <span class="text-h6 text-medium-emphasis">=</span>
      <ColorDot v-if="target" :color="target" :size="dotSize + 16" />
      <span v-else class="mystery text-h5" :style="{ width: `${dotSize + 16}px`, height: `${dotSize + 16}px` }">?</span>
    </div>
    <CountdownTimer v-if="deadline" :deadline="deadline" :server-now="serverNow" />
  </StatusCard>
</template>

<script setup lang="ts">
import { CountdownTimer, StatusCard } from '@wsfg/core/ui'
import { computed } from 'vue'
import ColorDot from './ColorDot.vue'

const props = defineProps<{
  colors: string[]
  target?: string | null
  deadline?: number | null
  serverNow: () => number
  compact?: boolean
}>()
// six colours still fit one row on a phone
const dotSize = computed(() => (props.colors.length > 4 ? 32 : 44))
</script>

<style scoped>
.mystery {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px dashed currentColor;
  opacity: 0.6;
}
</style>
