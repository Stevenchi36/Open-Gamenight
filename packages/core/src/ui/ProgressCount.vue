<template>
  <div class="mb-4">
    <div class="text-body-2 mb-1">{{ done }} / {{ total }} {{ label }}</div>
    <v-progress-linear :model-value="(done / Math.max(1, total)) * 100" color="primary" rounded height="6" />
  </div>
</template>

<script setup lang="ts">
// "3 / 5 voted" with a bar: how many players have done the thing the table is waiting for.
defineProps<{ done: number; total: number; label: string }>()
</script>
