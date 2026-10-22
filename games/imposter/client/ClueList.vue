<template>
  <v-card class="mb-4">
    <v-card-title class="text-subtitle-1">Clues</v-card-title>
    <v-card-text v-if="view.clues.length === 0" class="text-medium-emphasis">No clues yet.</v-card-text>
    <v-list v-else density="compact">
      <v-list-item v-for="row in byPlayer" :key="row.playerId" :subtitle="nameOf(room, row.playerId)">
        <v-list-item-title class="text-wrap">
          <span v-for="(c, i) in row.clues" :key="c.rotation" :class="{ 'ml-3': i > 0 }">
            <span v-if="view.turn.totalRotations > 1" class="text-medium-emphasis">{{ c.rotation }}.</span>
            {{ c.word }}
          </span>
        </v-list-item-title>
      </v-list-item>
    </v-list>
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
