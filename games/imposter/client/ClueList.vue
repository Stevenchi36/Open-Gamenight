<template>
  <v-card class="mb-4">
    <v-card-title class="text-subtitle-1">Clues</v-card-title>
    <v-card-text v-if="view.clues.length === 0" class="text-medium-emphasis">No clues yet.</v-card-text>
    <v-card-text v-else class="pt-0">
      <div v-for="row in byPlayer" :key="row.playerId" class="mb-3">
        <h4 class="player">{{ nameOf(room, row.playerId) }}</h4>
        <ul class="clues text-body-1">
          <li v-for="c in row.clues" :key="c.rotation">{{ c.word }}</li>
        </ul>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { RoomView } from '@wsfg/core/protocol'
import { computed } from 'vue'
import type { Clue, ImposterView } from '../shared/index.ts'
import { nameOf } from '@wsfg/core/ui'

const props = defineProps<{ view: ImposterView; room: RoomView }>()

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
</style>
