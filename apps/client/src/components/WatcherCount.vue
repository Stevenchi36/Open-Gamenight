<template>
  <div class="d-inline-flex align-center ga-1 text-medium-emphasis" :title="label" :aria-label="label" role="img">
    <v-icon icon="mdi-eye" :size="large ? 'default' : 'small'" />
    <span :class="large ? 'text-title-large' : 'text-body-medium'">{{ count }}</span>
  </div>
</template>

<script setup lang="ts">
// How many are watching the room: an eye and the number, used by the room and watch pages.
import { computed } from 'vue'

const props = defineProps<{ count: number; large?: boolean }>()
const label = computed(() => `${props.count} watching`)
</script>
