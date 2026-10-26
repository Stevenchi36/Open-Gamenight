<template>
  <StatusCard :compact="compact" :prominent="!compact" color="primary" overline="Mix these in equal parts">
    <div class="d-flex align-center justify-center ga-3 my-2" :style="{ '--swatch-h': `${height}px` }">
      <!-- flush strips, like a paint chip, so the colours sit side by side as they'll be compared -->
      <div class="palette">
        <span v-for="(color, i) in colors" :key="i" class="strip" :style="{ background: color }" role="img" :aria-label="color" />
      </div>
      <span class="text-title-large text-medium-emphasis">=</span>
      <span v-if="target" class="answer" :style="{ background: target }" role="img" :aria-label="target" />
      <span v-else class="answer mystery text-headline-small">?</span>
    </div>
    <CountdownTimer v-if="deadline" :deadline="deadline" :server-now="serverNow" />
  </StatusCard>
</template>

<script setup lang="ts">
import { CountdownTimer, StatusCard } from '@wsfg/core/ui'
import { computed } from 'vue'

const props = defineProps<{
  colors: string[]
  target?: string | null
  deadline?: number | null
  serverNow: () => number
  compact?: boolean
}>()
const height = computed(() => (props.compact ? 64 : 96))
</script>

<style scoped>
.palette {
  display: flex;
  min-width: 0;
  height: var(--swatch-h);
  border-radius: 8px;
  overflow: hidden;
  /* keeps white and near-background colours visible in both themes */
  box-shadow: 0 0 0 1px rgba(128, 128, 128, 0.5);
}
/* a real width, not just flex-basis: the palette sizes to its content, and empty
   spans sized only by flex-basis collapse it to 0. Still shrinks on a narrow phone. */
.strip {
  flex: 0 1 auto;
  width: calc(var(--swatch-h) / 2);
  min-width: 0;
}
.answer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--swatch-h);
  height: var(--swatch-h);
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(128, 128, 128, 0.5);
}
.mystery {
  box-shadow: none;
  border: 2px dashed currentColor;
  opacity: 0.6;
}
</style>
