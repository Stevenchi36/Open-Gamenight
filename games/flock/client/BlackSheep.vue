<template>
  <!-- On a light disc so the black sheep stays visible in the dark theme. -->
  <v-icon :size="size" color="grey-darken-4" class="black-sheep" role="img" aria-hidden="false" aria-label="Black sheep">mdi-sheep</v-icon>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: string | number }>(), { size: 'small' })
</script>

<style scoped>
.black-sheep {
  background: #e0e0e0;
  border-radius: 50%;
  padding: 0.15em;
  box-sizing: content-box;
}
</style>
