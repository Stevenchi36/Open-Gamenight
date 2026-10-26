<template>
  <div class="mb-4">
    <v-card
      v-for="(slot, i) in slots"
      :key="slot.id"
      :color="winningIds?.includes(slot.id) ? 'success' : undefined"
      :variant="winningIds?.includes(slot.id) ? 'flat' : 'tonal'"
      class="mb-2"
      :class="{ 'slot--in': stagger }"
      :style="stagger ? { animationDelay: `${i * 150}ms` } : undefined"
      v-bind="pickable ? { onClick: () => emit('pick', slot.id) } : {}"
    >
      <v-card-text class="d-flex align-center ga-3 py-3">
        <div class="text-center" style="min-width: 3.5ch">
          <div class="text-title-large font-weight-bold">×{{ slot.odds }}</div>
        </div>
        <div class="flex-grow-1">
          <div class="text-body-large font-weight-medium">
            <template v-if="slot.value === null">All too high</template>
            <template v-else>{{ formatValue(slot.value, unit) }}</template>
          </div>
          <div class="text-body-medium text-medium-emphasis">
            <template v-if="slot.value === null">The answer is below every guess</template>
            <template v-else>{{ slot.playerIds.map((id) => (id === me ? 'You' : nameOf(room, id))).join(', ') }}</template>
          </div>
          <div v-if="tokensOn(slot.id).length" class="d-flex flex-wrap ga-1 mt-1">
            <v-chip v-for="t in tokensOn(slot.id)" :key="t.key" size="small" :color="t.mine ? 'primary' : undefined" variant="flat">
              <v-icon start size="small">mdi-poker-chip</v-icon>
              {{ t.label }}<template v-if="t.count > 1"> ×{{ t.count }}</template>
              <template v-if="t.stake"> +{{ t.stake }}</template>
              <v-icon v-if="t.mine && removable" end size="small" @click.stop="emit('remove', slot.id)">mdi-close</v-icon>
            </v-chip>
          </div>
        </div>
        <v-icon v-if="pickable" class="text-medium-emphasis">mdi-plus-circle-outline</v-icon>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
// The betting board: one card per slot with its odds, who guessed it, and the tokens on it.
import type { RoomView } from '@wsfg/core/protocol'
import { nameOf } from '@wsfg/core/ui'
import type { Bet, Slot } from '../shared/index.ts'
import { formatValue } from './format.ts'

const props = defineProps<{
  slots: Slot[]
  unit: string | null
  room: RoomView
  me: string
  /** Bets to show by player (public bets, or everyone's in RESULTS). */
  bets?: Record<string, Bet[]> | null
  /** This player's tokens while choosing; shown instead of their entry in `bets`. */
  draft?: Bet[]
  winningIds?: string[]
  /** Tapping a slot places a token there. */
  pickable?: boolean
  /** Your tokens get a remove button. */
  removable?: boolean
  /** Cards drop in one after another (the TV's reveal). */
  stagger?: boolean
}>()
const emit = defineEmits<{ pick: [slot: string]; remove: [slot: string] }>()

interface Token {
  key: string
  label: string
  mine: boolean
  count: number
  stake: number
}

/** Tokens on a slot, grouped per player: "Sam ×2 +3". */
function tokensOn(slot: string): Token[] {
  const byPlayer: Record<string, Bet[]> = { ...(props.bets ?? {}) }
  if (props.draft) byPlayer[props.me] = props.draft
  const tokens: Token[] = []
  for (const [id, bets] of Object.entries(byPlayer)) {
    const here = bets.filter((b) => b.slot === slot)
    if (here.length === 0) continue
    tokens.push({
      key: id,
      label: id === props.me ? 'You' : nameOf(props.room, id),
      mine: id === props.me,
      count: here.length,
      stake: here.reduce((n, b) => n + b.stake, 0),
    })
  }
  return tokens.sort((a, b) => Number(b.mine) - Number(a.mine))
}
</script>

<style scoped>
.slot--in {
  animation: slot-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
@keyframes slot-in {
  from {
    transform: translateY(-16px) scale(0.92);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .slot--in {
    animation: none;
  }
}
</style>
