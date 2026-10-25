<template>
  <span class="d-inline-flex align-center" :aria-label="`${lives} of ${max} lives left`">
    <v-icon v-for="i in max" :key="i" :size="size" :color="i <= lives ? 'error' : undefined" :class="{ 'text-disabled': i > lives }">
      {{ i <= lives ? 'mdi-heart' : 'mdi-heart-outline' }}
    </v-icon>
  </span>
</template>

<script setup lang="ts">
// The team's shared lives: full hearts left, outlines lost.
withDefaults(defineProps<{ lives: number; max: number; size?: string | number }>(), { size: 'small' })
</script>
