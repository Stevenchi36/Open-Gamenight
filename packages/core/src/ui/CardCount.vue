<template>
  <div class="d-flex align-center justify-center my-1">
    <PlayingCard v-for="i in Math.min(count, 4)" :key="i" size="sm" :class="{ 'card-count__card--stacked': i > 1 }" aria-hidden="true" />
    <span class="text-body-small font-weight-bold ml-1">
      {{ count }}<span class="d-sr-only"> {{ count === 1 ? 'card' : 'cards' }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
// A seat's hidden hand on a card table: up to four face-down cards fanned, then the count.
// The fan is decoration, so screen readers hear "7 cards", not "Face-down card" once per card.
import PlayingCard from './PlayingCard.vue'

defineProps<{ count: number }>()
</script>

<style scoped>
.card-count__card--stacked {
  margin-left: -14px;
}
</style>
