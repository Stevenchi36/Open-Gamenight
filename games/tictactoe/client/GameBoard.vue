<template>
  <div class="ttt-board mx-auto mb-4">
    <v-btn
      v-for="(cell, i) in board"
      :key="i"
      class="ttt-cell"
      variant="tonal"
      rounded="lg"
      :color="line?.includes(i) ? 'primary' : undefined"
      :class="{ 'pointer-events-none': !canPlace(i) }"
      :aria-disabled="!canPlace(i)"
      :aria-label="`Square ${i + 1}: ${cell ?? 'empty'}`"
      @click="canPlace(i) && emit('place', i)"
    >
      <v-icon v-if="cell" :icon="cell === 'X' ? 'mdi-close' : 'mdi-circle-outline'" size="56" />
    </v-btn>
  </div>
</template>

<script setup lang="ts">
// The 3x3 grid. Empty squares are tappable only on your turn; the winning line lights up.
import type { Cell } from '../shared/index.ts'

const props = defineProps<{ board: Cell[]; line: number[] | null; playable: boolean }>()
const emit = defineEmits<{ place: [cell: number] }>()

// Not `disabled`: Vuetify would fade the marks on squares you can't tap.
const canPlace = (i: number) => props.playable && props.board[i] === null
</script>

<style scoped>
.ttt-board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  max-width: 360px;
}
.ttt-cell {
  aspect-ratio: 1;
  height: auto !important;
  min-width: 0 !important;
}
</style>
