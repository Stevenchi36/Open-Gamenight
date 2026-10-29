<template>
  <p class="d-sr-only">{{ summary }}</p>
  <svg class="db-board mx-auto mb-4" :viewBox="`0 0 ${size} ${size}`" :style="{ maxWidth: `${(grid + 1) * 60}px` }" role="group" aria-label="Board">
    <template v-for="(row, r) in boxes" :key="`b${r}`">
      <template v-for="(owner, c) in row" :key="`b${r},${c}`">
        <g v-if="owner !== null" class="db-box" :class="{ 'db-box--claimed': claimed.includes(`${r},${c}`) }">
          <rect :x="x(c) + 3" :y="x(r) + 3" :width="S - 6" :height="S - 6" rx="4" :fill="seatColor(owner)" />
          <text :x="x(c) + S / 2" :y="x(r) + S / 2" class="db-initial" :fill="onSeatColor(owner)">{{ initials[owner] }}</text>
        </g>
      </template>
    </template>

    <template v-for="l in lines" :key="key(l)">
      <line v-if="!l.drawn" class="db-guide" v-bind="ends(l)" />
      <g
        v-if="!l.drawn && playable"
        class="db-target"
        role="button"
        tabindex="0"
        :aria-label="label(l)"
        @click="emit('draw', l)"
        @keydown.enter.prevent="emit('draw', l)"
        @keydown.space.prevent="emit('draw', l)"
      >
        <polygon :points="diamond(l)" />
        <line class="db-preview" v-bind="ends(l)" :stroke="seat === null ? undefined : seatColor(seat)" />
      </g>
    </template>

    <template v-for="l in lines" :key="`d${key(l)}`">
      <line v-if="l.drawn" class="db-line" :class="{ 'db-line--last': isLast(l), 'db-line--drawing': drawing === key(l) }" v-bind="ends(l)" />
    </template>

    <template v-for="r in grid + 1" :key="`r${r}`">
      <circle v-for="c in grid + 1" :key="c" class="db-dot" :cx="x(c - 1)" :cy="x(r - 1)" r="4.5" />
    </template>
  </svg>
</template>

<script setup lang="ts">
// The grid as SVG. Each undrawn line's tap target is the diamond between its two dots
// and the centres of the boxes either side, so targets tile the board without overlapping.
// A line drawn while the board is on screen draws in from its first dot, and the boxes it
// claims then fill in; the first render shows the board as it stands, so nothing replays.
import { computed, ref, watch } from 'vue'
import type { Line } from '../shared/index.ts'
import { onSeatColor, seatColor } from './text.ts'

const props = defineProps<{
  grid: number
  h: boolean[][]
  v: boolean[][]
  boxes: (number | null)[][]
  last: Line | null
  /** One letter per seat, so colour isn't the only cue. */
  initials: string[]
  playable: boolean
  /** Yours, for the hover preview. */
  seat: number | null
}>()
const emit = defineEmits<{ draw: [line: Line] }>()

/** Dot spacing; half of it pads the edge so the outer diamonds fit. */
const S = 40
const size = computed(() => props.grid * S + S)
const x = (i: number) => S / 2 + i * S

const lines = computed(() => [
  ...props.h.flatMap((row, r) => row.map((drawn, c) => ({ dir: 'h' as const, row: r, col: c, drawn }))),
  ...props.v.flatMap((row, r) => row.map((drawn, c) => ({ dir: 'v' as const, row: r, col: c, drawn }))),
])

const key = (l: Line) => `${l.dir}${l.row},${l.col}`
const isLast = (l: Line) => !!props.last && key(props.last) === key(l)

// Every broadcast brings new objects, so compare keys and owners, not references.
const drawing = ref<string | null>(null)
const claimed = ref<string[]>([])
watch(
  () => props.last,
  (now, before) => {
    // Cleared on a new game, so its first line animates even where the last game's ended.
    if (!now) drawing.value = null
    else if (!(before && key(before) === key(now))) drawing.value = key(now)
  },
)
watch(
  () => props.boxes,
  (now, before) => {
    claimed.value = now.flatMap((row, r) => row.flatMap((owner, c) => (owner !== null && before[r]?.[c] == null ? [`${r},${c}`] : [])))
  },
)

function ends(l: Line) {
  const x1 = x(l.col)
  const y1 = x(l.row)
  return l.dir === 'h' ? { x1, y1, x2: x1 + S, y2: y1 } : { x1, y1, x2: x1, y2: y1 + S }
}

function diamond(l: Line): string {
  const { x1, y1, x2, y2 } = ends(l)
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const h = S / 2
  const sides = l.dir === 'h' ? [`${mx},${my - h}`, `${mx},${my + h}`] : [`${mx - h},${my}`, `${mx + h},${my}`]
  return [`${x1},${y1}`, sides[0], `${x2},${y2}`, sides[1]].join(' ')
}

function where(l: Line): string {
  return l.dir === 'h' ? `across from row ${l.row + 1}, dot ${l.col + 1}` : `down from row ${l.row + 1}, dot ${l.col + 1}`
}

/** Sides drawn around a box, or null off the board. */
function sides(r: number, c: number): number | null {
  if (r < 0 || c < 0 || r >= props.grid || c >= props.grid) return null
  return [props.h[r]![c], props.h[r + 1]![c], props.v[r]![c], props.v[r]![c + 1]].filter(Boolean).length
}

// Screen readers can't see which lines are drawn, so each target says what it does to the boxes
// either side: "Line across from row 2, dot 1: completes the box above; the box below has 1 side".
function label(l: Line): string {
  const around: [string, number, number][] =
    l.dir === 'h'
      ? [['above', l.row - 1, l.col], ['below', l.row, l.col]]
      : [['left', l.row, l.col - 1], ['right', l.row, l.col]]
  const notes = around.flatMap(([side, r, c]) => {
    const n = sides(r, c)
    if (n === null) return []
    const box = side === 'left' || side === 'right' ? `the box to the ${side}` : `the box ${side}`
    return [n === 3 ? `completes ${box}` : `${box} has ${n} side${n === 1 ? '' : 's'}`]
  })
  return `Line ${where(l)}: ${notes.join('; ')}`
}

const summary = computed(() => {
  const claimed = props.boxes.flat().filter((o) => o !== null).length
  const last = props.last ? ` Last line: ${where(props.last)}.` : ''
  return `Dots and Boxes board, ${props.grid} by ${props.grid} boxes, ${claimed} claimed.${last}`
})
</script>

<style scoped>
.db-board {
  display: block;
  width: 100%;
  touch-action: manipulation;
}
.db-initial {
  font-size: 18px;
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
}
.db-guide {
  stroke: rgba(var(--v-theme-on-surface), 0.12);
  stroke-width: 2;
  stroke-dasharray: 3 5;
}
.db-target {
  cursor: pointer;
  outline: none;
}
.db-target polygon {
  fill: transparent;
}
.db-preview {
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 5;
  stroke-linecap: round;
  opacity: 0;
}
.db-target:hover .db-preview,
.db-target:focus-visible .db-preview {
  opacity: 0.6;
}
.db-line {
  stroke: rgb(var(--v-theme-on-surface));
  stroke-width: 4;
  stroke-linecap: round;
  pointer-events: none;
}
.db-line--last {
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 6;
}
.db-dot {
  fill: rgb(var(--v-theme-on-surface));
  pointer-events: none;
}

/* Every line is one dot spacing (S = 40) long, so a 40 dash slides in from its first dot. */
.db-line--drawing {
  stroke-dasharray: 40;
  animation: db-draw 0.25s ease-out;
}
@keyframes db-draw {
  from {
    stroke-dashoffset: 40;
  }
}
/* Waits for the line that closed it, then grows from its centre. */
.db-box--claimed {
  transform-box: fill-box;
  transform-origin: center;
  animation: db-claim 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s backwards;
}
@keyframes db-claim {
  from {
    transform: scale(0.2);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .db-line--drawing,
  .db-box--claimed {
    animation: none;
  }
}
</style>
