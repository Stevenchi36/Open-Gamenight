<template>
  <v-icon :size="size" color="pink-lighten-1" aria-label="Pink cow">mdi-cow</v-icon>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: string | number }>(), { size: 'small' })
</script>
