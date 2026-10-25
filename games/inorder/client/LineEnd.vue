<template>
  <div class="d-flex align-center ga-2 text-body-2 text-medium-emphasis" :class="end === 'low' ? 'mb-2' : 'mt-2'">
    <v-icon size="small">{{ end === 'low' ? 'mdi-arrow-collapse-up' : 'mdi-arrow-collapse-down' }}</v-icon>
    <span><strong>{{ end === 'low' ? 1 : MAX_NUMBER }}</strong> · {{ end === 'low' ? theme.low : theme.high }}</span>
  </div>
</template>

<script setup lang="ts">
// The label at each end of the line: what the lowest and highest numbers mean.
import { MAX_NUMBER, type Theme } from '../shared/index.ts'

defineProps<{ theme: Theme; end: 'low' | 'high' }>()
</script>
