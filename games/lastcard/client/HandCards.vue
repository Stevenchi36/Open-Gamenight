<template>
  <div class="d-flex flex-wrap justify-center ga-1">
    <component
      :is="playable[i] ? 'button' : 'div'"
      v-for="(card, i) in hand"
      :key="i"
      :type="playable[i] ? 'button' : undefined"
      class="hand-card"
      :class="{ 'hand-card--playable': playable[i], 'hand-card--selected': i === selected, 'hand-card--dim': dimUnplayable && !playable[i] }"
      :aria-label="playable[i] ? `Play ${cardName(card)}` : undefined"
      :aria-pressed="playable[i] ? i === selected : undefined"
      @click="playable[i] && emit('select', i)"
    >
      <LcCard :card="card" />
    </component>
  </div>
</template>

<script setup lang="ts">
// Your hand, sorted by colour. Cards you can play now are raised and can be tapped to pick one.
import type { LcCard as Card } from '../shared/index.ts'
import LcCard from './LcCard.vue'
import { cardName } from './text.ts'

defineProps<{
  hand: Card[]
  /** Per card: may it be picked now. */
  playable: boolean[]
  selected: number | null
  /** Fade the rest (on your turn); out of turn the hand stays plain. */
  dimUnplayable: boolean
}>()
const emit = defineEmits<{ select: [index: number] }>()
</script>

<style scoped>
.hand-card {
  padding: 3px;
  border-radius: 9px;
  border: 2px solid transparent;
  background: none;
  transition: transform 0.12s, border-color 0.12s, opacity 0.12s;
}
.hand-card--playable {
  cursor: pointer;
  transform: translateY(-4px);
}
.hand-card--playable:hover {
  border-color: rgba(var(--v-theme-primary), 0.4);
}
.hand-card--selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
  transform: translateY(-10px);
}
.hand-card--dim {
  opacity: 0.45;
}
</style>
