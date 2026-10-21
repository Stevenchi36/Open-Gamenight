<template>
  <v-card variant="tonal">
    <v-card-title class="text-subtitle-1">Scoreboard</v-card-title>
    <v-list density="compact" bg-color="transparent">
      <v-list-item v-for="(row, i) in rows" :key="row.id">
        <template #prepend>
          <span class="mr-3 text-medium-emphasis" style="width: 1.5em">{{ i + 1 }}.</span>
        </template>
        <v-list-item-title>
          {{ row.name }}
          <v-chip v-if="row.gained" size="x-small" color="success" class="ml-1">+{{ row.gained }}</v-chip>
        </v-list-item-title>
        <template #append>
          <span class="text-h6">{{ row.score }}</span>
        </template>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<script setup lang="ts">
import type { RoomView } from '@wsfg/core/protocol'
import { computed } from 'vue'
import { nameOf } from './util.ts'

const props = defineProps<{ scores: Record<string, number>; room: RoomView; gained?: Record<string, number> }>()
const rows = computed(() =>
  Object.entries(props.scores)
    .map(([id, score]) => ({ id, score, name: nameOf(props.room, id), gained: props.gained?.[id] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
)
</script>
