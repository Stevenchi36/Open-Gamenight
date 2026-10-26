<template>
  <div class="d-flex flex-wrap justify-center ga-3" data-card-anchor="hand">
    <component
      :is="selectable ? 'button' : 'div'"
      v-for="group in groups"
      :key="group.rank"
      :type="selectable ? 'button' : undefined"
      class="hand-group"
      :class="{ 'hand-group--selectable': selectable, 'hand-group--selected': group.rank === selected }"
      :aria-label="selectable ? `Ask for ${rankName(group.rank)} (you have ${group.cards.length})` : undefined"
      :aria-pressed="selectable ? group.rank === selected : undefined"
      @click="selectable && emit('select', group.rank)"
    >
      <PlayingCard
        v-for="(card, i) in group.cards"
        :key="card.suit"
        v-bind="arrival(card.rank + card.suit)"
        :card="card"
        class="hand-card"
        :class="{ 'hand-card--stacked': i > 0 }"
      />
    </component>
  </div>
</template>

<script setup lang="ts">
// Your hand, grouped by rank. While it's your turn a group can be tapped to pick the rank to ask for.
import { rankName, type Card, type Rank } from '@wsfg/core/kit'
import { PlayingCard, useArrivals } from '@wsfg/core/ui'
import { computed } from 'vue'

const props = defineProps<{
  hand: Card[]
  selectable: boolean
  selected: Rank | null
  /** Just dealt: the whole hand drops in on first render. */
  dealing?: boolean
}>()
const emit = defineEmits<{ select: [rank: Rank] }>()

const arrival = useArrivals(() => props.hand.map((c) => c.rank + c.suit), props.dealing)

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
.hand-group {
  display: flex;
  padding: 4px;
  border-radius: 10px;
  border: 2px solid transparent;
  background: none;
  transition: transform 0.12s, border-color 0.12s;
}
.hand-group--selectable {
  cursor: pointer;
}
.hand-group--selectable:hover {
  border-color: rgba(var(--v-theme-primary), 0.4);
}
.hand-group--selected {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
  transform: translateY(-6px);
}
.hand-card--stacked {
  margin-left: -28px;
}
</style>
