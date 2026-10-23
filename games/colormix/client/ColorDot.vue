<template>
  <span class="color-dot" :style="{ background: color, width: px, height: px }" role="img" :aria-label="color" />
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ color: string; size?: number }>(), { size: 48 })
const px = computed(() => `${props.size}px`)
</script>

<style scoped>
.color-dot {
  display: inline-block;
  flex: none;
  border-radius: 50%;
  /* keeps white and near-background colours visible in both themes */
  box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.5);
}
</style>
