<template>
  <div class="d-flex flex-wrap justify-center ga-2" data-card-anchor="hand">
    <div v-for="group in groups" :key="group.rank" class="d-flex">
      <button
        v-for="(card, i) in group.cards"
        :key="card.suit"
        type="button"
        v-bind="arrival(card.rank + card.suit)"
        class="hand-card"
        :class="{ 'hand-card--stacked': i > 0, 'hand-card--selected': isSelected(card) }"
        :aria-label="`${card.rank} of ${SUIT_NAMES[card.suit]}`"
        :aria-pressed="isSelected(card)"
        @click="emit('toggle', card)"
      >
        <PlayingCard :card="card" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Your hand, grouped by rank. Tap cards to pick the ones to play; picked cards rise.
import type { Card, Rank, Suit } from '@ogn/core/kit'
import { PlayingCard, useArrivals } from '@ogn/core/ui'
import { computed } from 'vue'

const props = defineProps<{
  hand: Card[]
  selected: Card[]
  /** Just dealt: the whole hand drops in on first render. */
  dealing?: boolean
  /** ms before new cards drop in (after the cards bringing them land). */
  arriveDelay?: number
}>()
const emit = defineEmits<{ toggle: [card: Card] }>()

const SUIT_NAMES: Record<Suit, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }

const arrival = useArrivals(
  () => props.hand.map((c) => c.rank + c.suit),
  props.dealing,
  () => props.arriveDelay ?? 430,
)

const isSelected = (card: Card) => props.selected.some((c) => c.rank === card.rank && c.suit === card.suit)

// The hand arrives sorted by rank, so groups come out in order.
const groups = computed(() => {
  const out: { rank: Rank; cards: Card[] }[] = []
  for (const card of props.hand) {
    const last = out.at(-1)
    if (last?.rank === card.rank) last.cards.push(card)
    else out.push({ rank: card.rank, cards: [card] })
  }
  return out
})
</script>

<style scoped>
.hand-card {
  padding: 0;
  border: none;
  background: none;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.12s;
}
.hand-card--stacked {
  margin-left: -22px;
}
.hand-card--selected {
  transform: translateY(-10px);
}
.hand-card--selected :deep(.playing-card) {
  outline: 3px solid rgb(var(--v-theme-primary));
}
</style>
