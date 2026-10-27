<template>
  <div class="pick-fan" role="group" :aria-label="`${count} face-down cards`">
    <button
      v-for="i in count"
      :key="i"
      type="button"
      class="pick-fan__card"
      :class="{ 'pick-fan__card--picked': i - 1 === picked }"
      :aria-label="`Card ${i} of ${count}`"
      :aria-pressed="i - 1 === picked"
      :disabled="disabled"
      @click="emit('pick', i - 1)"
    >
      <PlayingCard size="lg" />
    </button>
  </div>
</template>

<script setup lang="ts">
// The hand you draw from, face down and large: tap a card to lift it. Game-local until a second
// game draws blind from a hand.
import { PlayingCard } from '@ogn/core/ui'

defineProps<{ count: number; picked: number | null; disabled?: boolean }>()
const emit = defineEmits<{ pick: [index: number] }>()
</script>

<style scoped>
.pick-fan {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  row-gap: 8px;
  padding: 16px 0 4px 34px;
}
.pick-fan__card {
  margin-left: -34px;
  padding: 0;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.15s;
}
.pick-fan__card:hover:not(:disabled) {
  transform: translateY(-6px);
}
.pick-fan__card:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.pick-fan__card--picked,
.pick-fan__card--picked:hover:not(:disabled) {
  transform: translateY(-16px);
  box-shadow: 0 0 0 3px rgb(var(--v-theme-primary));
}
.pick-fan__card:disabled {
  cursor: default;
}
@media (prefers-reduced-motion: reduce) {
  .pick-fan__card {
    transition: none;
  }
}
</style>
