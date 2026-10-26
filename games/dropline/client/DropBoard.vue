<template>
  <div
    class="dl-board mx-auto mb-4"
    :class="{ 'dl-board--celebrate': celebrate }"
    :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxWidth: `${cols * (large ? 80 : 52)}px`, '--dl-drop-time': `${dropTime}ms` }"
  >
    <button
      v-for="(column, c) in columns"
      :key="c"
      type="button"
      class="dl-column"
      :class="{ 'dl-column--playable': canDrop(c) }"
      :disabled="!canDrop(c)"
      :aria-label="`Column ${c + 1}`"
      @click="emit('drop', c)"
    >
      <span
        v-for="row in rows"
        :key="row"
        class="dl-hole"
        :class="holeClass(column, c, rows - row)"
      >
        <span
          v-if="column[rows - row]"
          class="dl-disc"
          :class="discClass(column[rows - row]!, c, rows - row)"
          :style="dropping && isSpot(dropping, c, rows - row) ? { '--dl-fall': rows - dropping.row } : undefined"
        />
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
// The upright grid, drawn top row first. A whole column is the tap target; the
// last disc dropped gets a dot and the winning line a ring. `large` sizes it for the watch page's TV.
// A disc that arrives while the board is on screen falls into place, and a line won then pulses;
// the first render shows the board as it stands, so joining or reconnecting replays nothing.
import { computed, ref, watch } from 'vue'
import type { Disc, Spot } from '../shared/index.ts'

const props = defineProps<{
  columns: Disc[][]
  cols: number
  rows: number
  last: Spot | null
  line: Spot[] | null
  playable: boolean
  /** Yours, previewed where it would land in the hovered column. */
  disc: Disc | null
  large?: boolean
}>()
const emit = defineEmits<{ drop: [column: number] }>()

const canDrop = (c: number) => props.playable && props.columns[c]!.length < props.rows
const isSpot = (s: Spot, col: number, row: number) => s.col === col && s.row === row
const at = (spots: Spot[] | null, col: number, row: number) => spots?.some((s) => isSpot(s, col, row)) ?? false

// Every broadcast brings a new `last` object, so compare the spot, not the reference.
const dropping = ref<Spot | null>(null)
watch(
  () => props.last,
  (now, before) => {
    if (now && !(before && isSpot(before, now.col, now.row))) dropping.value = now
  },
)
// Falls from just above the board; time grows with the square root of the distance, like gravity.
const dropTime = computed(() => (dropping.value ? Math.round(150 * Math.sqrt(props.rows - dropping.value.row)) : 0))
const celebrate = computed(() => !!dropping.value && !!props.line && at(props.line, dropping.value.col, dropping.value.row))

function holeClass(column: Disc[], col: number, row: number) {
  return {
    'dl-hole--win': at(props.line, col, row),
    [`dl-hole--next-${props.disc}`]: !column[row] && row === column.length && !!props.disc,
  }
}

function discClass(disc: Disc, col: number, row: number) {
  return {
    [`dl-disc--${disc}`]: true,
    'dl-disc--last': !!props.last && isSpot(props.last, col, row),
    'dl-disc--dropping': !!dropping.value && isSpot(dropping.value, col, row),
  }
}
</script>

<style scoped>
/* Columns touch and each pads its holes by 3px, so holes sit 6px apart every way, 3px from the edge plus the board's own 3px. */
.dl-board {
  display: grid;
  padding: 3px;
  border-radius: 12px;
  background: rgb(var(--v-theme-primary));
}
/* Clips a falling disc to the board, so it slides in from the top edge. */
.dl-column {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 3px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: inherit;
  cursor: default;
  overflow: hidden;
}
.dl-column--playable {
  cursor: pointer;
}
.dl-column--playable:hover,
.dl-column--playable:focus-visible {
  background: rgba(255, 255, 255, 0.35);
  outline: none;
}
.dl-column--playable:hover .dl-hole--next-red,
.dl-column--playable:focus-visible .dl-hole--next-red {
  background: rgba(229, 57, 53, 0.55);
}
.dl-column--playable:hover .dl-hole--next-blue,
.dl-column--playable:focus-visible .dl-hole--next-blue {
  background: rgba(30, 136, 229, 0.55);
}
.dl-hole {
  position: relative;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgb(var(--v-theme-surface));
}
.dl-disc {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dl-disc--red {
  background: #e53935;
}
.dl-disc--blue {
  background: #1e88e5;
}
.dl-disc--last::after {
  content: '';
  width: 28%;
  height: 28%;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
}
/* At most 3px out, half the gap, so rings on neighbouring discs just meet. */
.dl-hole--win {
  box-shadow:
    0 0 0 1px rgb(var(--v-theme-surface)),
    0 0 0 3px rgb(var(--v-theme-on-surface));
}

/* One hole pitch is the disc's own height plus the 6px gap. The fall takes --dl-drop-time, then a short bounce. */
.dl-disc--dropping {
  animation: dl-drop calc(var(--dl-drop-time) + 160ms) linear;
}
@keyframes dl-drop {
  0% {
    transform: translateY(calc(var(--dl-fall) * (-100% - 6px)));
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  70% {
    transform: translateY(0);
    animation-timing-function: ease-out;
  }
  85% {
    transform: translateY(-12%);
    animation-timing-function: ease-in;
  }
  100% {
    transform: translateY(0);
  }
}
/* Waits for the winning disc to land; small enough that the column's 3px padding doesn't clip it. */
.dl-board--celebrate .dl-hole--win {
  animation: dl-win 0.45s ease-in-out calc(var(--dl-drop-time) + 160ms) 3;
}
@keyframes dl-win {
  50% {
    transform: scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dl-disc--dropping,
  .dl-board--celebrate .dl-hole--win {
    animation: none;
  }
}
</style>
