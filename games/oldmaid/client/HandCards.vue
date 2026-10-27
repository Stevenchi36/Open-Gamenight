<template>
  <div class="d-flex flex-wrap justify-center ga-2" data-card-anchor="hand">
    <component
      :is="arranging ? 'button' : 'div'"
      v-for="(card, i) in hand"
      :key="key(card)"
      :type="arranging ? 'button' : undefined"
      class="hand-slot"
      :class="{ 'hand-slot--arranging': arranging, 'hand-slot--held': i === held }"
      :aria-label="arranging ? (held === null ? `Move the ${cardText(card)}` : `Put it here, at place ${i + 1}`) : undefined"
      :aria-pressed="arranging ? i === held : undefined"
      @click="arranging && tap(i)"
    >
      <PlayingCard v-bind="arrival(key(card))" :card="card" />
    </component>
  </div>
</template>

<script setup lang="ts">
// Your hand. With Arrange hand it's in the order the next player draws from: tap a card, then
// the place it should go (tap it again to put it back).
import type { Card } from '@wsfg/core/kit'
import { PlayingCard, useArrivals } from '@wsfg/core/ui'
import { ref, watch } from 'vue'
import { cardText } from './text.ts'

const props = defineProps<{
  hand: Card[]
  arranging: boolean
  /** Just dealt: the whole hand drops in on first render. */
  dealing?: boolean
}>()
const emit = defineEmits<{ move: [order: number[]] }>()

const key = (c: Card) => c.rank + c.suit
const arrival = useArrivals(() => props.hand.map(key), props.dealing)

const held = ref<number | null>(null)
// A card taken from you, or one arriving, moves the places on: start the pick again.
watch(
  () => props.hand.map(key).join('|'),
  () => (held.value = null),
)

function tap(i: number) {
  const from = held.value
  if (from === null) {
    held.value = i
    return
  }
  held.value = null
  if (from === i) return
  const order = props.hand.map((_, k) => k)
  order.splice(i, 0, order.splice(from, 1)[0]!)
  emit('move', order)
}
</script>

<style scoped>
.hand-slot {
  padding: 2px;
  border-radius: 8px;
  border: 2px solid transparent;
  background: none;
  transition: transform 0.12s, border-color 0.12s;
}
.hand-slot--arranging {
  cursor: pointer;
}
.hand-slot--arranging:hover {
  border-color: rgba(var(--v-theme-primary), 0.4);
}
.hand-slot--held {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
  transform: translateY(-8px);
}
</style>
