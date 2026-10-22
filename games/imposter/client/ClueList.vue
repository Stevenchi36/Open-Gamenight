<template>
  <v-card class="mb-4">
    <v-card-title class="text-subtitle-1">Clues</v-card-title>
    <v-card-text v-if="view.clues.length === 0" class="text-medium-emphasis">No clues yet.</v-card-text>
    <v-card-text v-else class="pt-0">
      <div v-for="row in byPlayer" :key="row.playerId" class="mb-3">
        <h4 class="text-subtitle-1 font-weight-bold">{{ nameOf(room, row.playerId) }}</h4>
        <div v-for="c in row.clues" :key="c.rotation" class="pl-4 text-body-1">
          <span v-if="view.turn.totalRotations > 1" class="text-medium-emphasis">{{ c.rotation }}.</span>
          {{ c.word }}
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { RoomView } from '@wsfg/core/protocol'
import { computed } from 'vue'
import type { Clue, ImposterView } from '../shared/index.ts'
import { nameOf } from './util.ts'

const props = defineProps<{ view: ImposterView; room: RoomView }>()

// Clues arrive in turn order, so first appearance keeps rows stable; it also keeps players who left mid-round.
// Numbers are the rotation, so a skipped turn shows as a gap.
const byPlayer = computed(() => {
  const rows = new Map<string, Clue[]>()
  for (const c of props.view.clues) rows.set(c.playerId, [...(rows.get(c.playerId) ?? []), c])
  return [...rows].map(([playerId, clues]) => ({ playerId, clues }))
})
</script>
