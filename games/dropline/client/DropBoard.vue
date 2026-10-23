<template>
  <div class="dl-board mx-auto mb-4" :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)`, maxWidth: `${cols * 52}px` }">
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
      />
    </button>
  </div>
</template>

<script setup lang="ts">
// The upright grid, drawn top row first. A whole column is the tap target; the
// last disc dropped gets a dot and the winning line a ring.
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
}>()
const emit = defineEmits<{ drop: [column: number] }>()

const canDrop = (c: number) => props.playable && props.columns[c]!.length < props.rows
const at = (spots: Spot[] | null, col: number, row: number) => spots?.some((s) => s.col === col && s.row === row) ?? false

function holeClass(column: Disc[], col: number, row: number) {
  const disc = column[row]
  return {
    [`dl-hole--${disc}`]: !!disc,
    'dl-hole--last': props.last?.col === col && props.last.row === row,
    'dl-hole--win': at(props.line, col, row),
    [`dl-hole--next-${props.disc}`]: !disc && row === column.length && !!props.disc,
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
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgb(var(--v-theme-surface));
  display: flex;
  align-items: center;
  justify-content: center;
}
.dl-hole--red {
  background: #e53935;
}
.dl-hole--blue {
  background: #1e88e5;
}
.dl-hole--last::after {
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
</style>
