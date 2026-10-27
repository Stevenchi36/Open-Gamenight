<template>
  <v-card class="mb-4" :class="{ 'clue-list--large': large }">
    <v-card-title :class="large ? 'text-title-large' : 'text-body-large'">Clues</v-card-title>
    <v-card-text v-if="view.clues.length === 0" class="text-medium-emphasis">No clues yet.</v-card-text>
    <v-card-text v-else class="pt-0">
      <!-- Transition groups pop in clues sent while watching; the first render shows them as they are. -->
      <TransitionGroup name="clue-pop">
        <div v-for="row in byPlayer" :key="row.playerId" class="mb-3">
          <h4 class="player">{{ nameOf(room, row.playerId) }}</h4>
          <TransitionGroup tag="ul" name="clue-pop" class="clues text-body-large">
            <li v-for="c in row.clues" :key="c.rotation">{{ c.word }}</li>
          </TransitionGroup>
        </div>
      </TransitionGroup>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { RoomView } from '@ogn/core/protocol'
import { nameOf } from '@ogn/core/ui'
import { computed } from 'vue'
import type { Clue, ImposterView } from '../shared/index.ts'

const props = defineProps<{ view: ImposterView; room: RoomView; large?: boolean }>()

// Clues arrive in turn order, so first appearance keeps rows stable; it also keeps players who left mid-round.
const byPlayer = computed(() => {
  const rows = new Map<string, Clue[]>()
  for (const c of props.view.clues) rows.set(c.playerId, [...(rows.get(c.playerId) ?? []), c])
  return [...rows].map(([playerId, clues]) => ({ playerId, clues }))
})
</script>

<style scoped>
/* Spacing set explicitly so the clues sit right under the name. */
.player {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
  margin: 0;
}

.clues {
  list-style: disc;
  margin: 0;
  padding-left: 1.5rem;
  line-height: 1.4;
}

.clue-list--large .player {
  font-size: 1.25rem;
}
.clue-list--large .clues {
  font-size: 1.5rem !important;
}

.clue-pop-enter-active {
  transition:
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.2s;
}
.clue-pop-enter-from {
  transform: scale(0.6);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .clue-pop-enter-active {
    transition: none;
  }
}
</style>
