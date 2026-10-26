<template>
  <div class="ttt-board mx-auto mb-4" :class="{ 'ttt-board--large': large, 'ttt-board--celebrate': celebrate }">
    <v-btn
      v-for="(cell, i) in board"
      :key="i"
      class="ttt-cell"
      variant="tonal"
      rounded="lg"
      :color="line?.includes(i) ? 'primary' : undefined"
      :class="{ 'pointer-events-none': !canPlace(i), 'ttt-cell--win': line?.includes(i) }"
      :aria-disabled="!canPlace(i)"
      :aria-label="`Square ${i + 1}: ${cell ?? 'empty'}`"
      @click="canPlace(i) && emit('place', i)"
    >
      <v-icon v-if="cell" :class="{ 'ttt-mark--pop': popped.includes(i) }" :icon="cell === 'X' ? 'mdi-close' : 'mdi-circle-outline'" :size="large ? 112 : 56" />
    </v-btn>
  </div>
</template>

<script setup lang="ts">
// The 3x3 grid. Empty squares are tappable only on your turn; the winning line lights up.
// `large` sizes it for the watch page's TV.
// A mark placed while the board is on screen pops in, and a line won then pulses;
// the first render shows the board as it stands, so joining or reconnecting replays nothing.
import { ref, watch } from 'vue'
import type { Cell } from '../shared/index.ts'

const props = defineProps<{ board: Cell[]; line: number[] | null; playable: boolean; large?: boolean }>()
const emit = defineEmits<{ place: [cell: number] }>()

// Not `disabled`: Vuetify would fade the marks on squares you can't tap.
const canPlace = (i: number) => props.playable && props.board[i] === null

// Every broadcast brings a new board array, so compare squares, not the reference.
const popped = ref<number[]>([])
const celebrate = ref(false)
watch(
  () => props.board,
  (now, before) => {
    popped.value = now.flatMap((cell, i) => (cell && !before[i] ? [i] : []))
  },
)
watch(
  () => props.line,
  (now, before) => {
    celebrate.value = !!now && !before
  },
)
</script>

<style scoped>
.ttt-board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  max-width: 360px;
}
.ttt-board--large {
  gap: 12px;
  max-width: 600px;
}
.ttt-cell {
  aspect-ratio: 1;
  height: auto !important;
  min-width: 0 !important;
}

.ttt-mark--pop {
  animation: ttt-pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes ttt-pop {
  from {
    transform: scale(0.2);
    opacity: 0;
  }
}
/* Waits for the winning mark to pop in. */
.ttt-board--celebrate .ttt-cell--win {
  animation: ttt-win 0.45s ease-in-out 0.32s 3;
}
@keyframes ttt-win {
  50% {
    transform: scale(1.06);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ttt-mark--pop,
  .ttt-board--celebrate .ttt-cell--win {
    animation: none;
  }
}
</style>
