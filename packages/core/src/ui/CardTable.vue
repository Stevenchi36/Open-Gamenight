<template>
  <div class="card-table-wrap">
    <div class="d-flex justify-end mb-1">
      <v-btn-toggle :model-value="layout" density="compact" variant="outlined" divided mandatory aria-label="Layout" @update:model-value="setLayout">
        <v-btn value="table" size="small" prepend-icon="mdi-circle-outline">Table</v-btn>
        <v-btn value="list" size="small" prepend-icon="mdi-format-list-bulleted">List</v-btn>
      </v-btn-toggle>
    </div>

    <div v-if="layout === 'table'" class="card-table">
      <div class="card-table__felt">
        <slot name="center" />
      </div>
      <component
        :is="isTappable(seat.id) ? 'button' : 'div'"
        v-for="seat in placed"
        :key="seat.id"
        :type="isTappable(seat.id) ? 'button' : undefined"
        class="card-table__seat"
        :class="seatClasses(seat.id)"
        :style="{ left: `${seat.x}%`, top: `${seat.y}%` }"
        :aria-pressed="isTappable(seat.id) ? seat.id === selected : undefined"
        @click="isTappable(seat.id) && emit('select', seat.id)"
      >
        <div class="card-table__name">
          <v-icon v-if="!isConnected(room, seat.id) && !dimmed.includes(seat.id)" size="x-small" class="mr-1">mdi-wifi-off</v-icon>
          <span class="text-truncate">{{ seat.id === me ? 'You' : nameOf(room, seat.id) }}</span>
        </div>
        <slot name="seat" :id="seat.id" />
      </component>
    </div>

    <div v-else class="card-list">
      <div class="card-list__center"><slot name="center" /></div>
      <component
        :is="isTappable(id) ? 'button' : 'div'"
        v-for="id in listed"
        :key="id"
        :type="isTappable(id) ? 'button' : undefined"
        class="card-table__seat card-list__row"
        :class="seatClasses(id)"
        :aria-pressed="isTappable(id) ? id === selected : undefined"
        @click="isTappable(id) && emit('select', id)"
      >
        <div class="card-table__name card-list__name">
          <v-icon v-if="!isConnected(room, id) && !dimmed.includes(id)" size="x-small" class="mr-1">mdi-wifi-off</v-icon>
          <span class="text-truncate">{{ id === me ? 'You' : nameOf(room, id) }}</span>
        </div>
        <div class="card-list__content"><slot name="seat" :id="id" /></div>
      </component>
    </div>
  </div>
</template>

<script setup lang="ts">
// Players round an oval table in seat order, clockwise, turned so the viewer sits at the bottom;
// or, by each player's choice, a plain list in seat order. The game fills each seat (`seat` slot)
// and the middle (`center`); seats in `tappable` can be picked.
import { computed, ref } from 'vue'
import type { PlayerId } from '../contract.ts'
import type { RoomView } from '../protocol.ts'
import { isConnected, nameOf } from './helpers.ts'
import { load, save } from './storage.ts'

const props = withDefaults(
  defineProps<{
    room: RoomView
    /** Seat order; turns go this way. */
    seats: PlayerId[]
    /** The viewer; when not seated, the first seat goes at the bottom. */
    me: PlayerId
    turn?: PlayerId | null
    /** Seats the viewer may pick. */
    tappable?: PlayerId[]
    selected?: PlayerId | null
    /** Seats shown faded (players who left). */
    dimmed?: PlayerId[]
  }>(),
  { turn: null, tappable: () => [], selected: null, dimmed: () => [] },
)
const emit = defineEmits<{ select: [id: PlayerId] }>()

type Layout = 'table' | 'list'
const LAYOUT_KEY = 'cardTableLayout'
// Until a player picks, phones get the list: six seats round an oval are tight there.
const layout = ref<Layout>(load<Layout>(LAYOUT_KEY) ?? (window.matchMedia('(max-width: 520px)').matches ? 'list' : 'table'))
function setLayout(value: Layout) {
  layout.value = value
  save(LAYOUT_KEY, value)
}

const isTappable = (id: PlayerId) => props.tappable.includes(id)
const seatClasses = (id: PlayerId) => ({
  'card-table__seat--turn': id === props.turn,
  'card-table__seat--tappable': isTappable(id),
  'card-table__seat--selected': id === props.selected,
  'card-table__seat--dimmed': props.dimmed.includes(id),
})

// The list starts with the viewer, then goes on in turn order, as the table does clockwise from the bottom.
const listed = computed(() => {
  const from = Math.max(0, props.seats.indexOf(props.me))
  return [...props.seats.slice(from), ...props.seats.slice(0, from)]
})

// Positions in % of the table box: an ellipse a little inside the edges so seats don't overflow.
// Screen y grows downwards, so increasing angles from the bottom run clockwise.
const placed = computed(() => {
  const n = props.seats.length
  const bottom = Math.max(0, props.seats.indexOf(props.me))
  return props.seats.map((id, i) => {
    const angle = Math.PI / 2 + ((i - bottom) * 2 * Math.PI) / n
    return { id, x: 50 + 37 * Math.cos(angle), y: 50 + 39 * Math.sin(angle) }
  })
})
</script>

<style scoped>
.card-table-wrap {
  container-type: inline-size;
}
.card-table {
  position: relative;
  aspect-ratio: 16 / 10;
}
.card-table__felt {
  position: absolute;
  inset: 16% 12%;
  border-radius: 50%;
  background: rgba(var(--v-theme-success), 0.16);
  border: 3px solid rgba(var(--v-theme-success), 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.card-table__seat {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 24%;
  max-width: 150px;
  padding: 4px 6px;
  border-radius: 10px;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  text-align: center;
  transition: border-color 0.15s, background-color 0.15s;
}
.card-table__seat--turn {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.25);
}
.card-table__seat--tappable {
  cursor: pointer;
  border-style: dashed;
  border-color: rgb(var(--v-theme-primary));
}
/* Seats stay opaque so the felt never shows through: the tint is layered over the surface colour,
   and a dimmed seat fades its contents rather than the whole box. */
.card-table__seat--selected {
  border-style: solid;
  background: linear-gradient(rgba(var(--v-theme-primary), 0.18), rgba(var(--v-theme-primary), 0.18)), rgb(var(--v-theme-surface));
}
.card-table__seat--dimmed > * {
  opacity: 0.45;
}
.card-table__name {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 500;
  min-width: 0;
}

/* List layout: one row per seat, name on the left and the game's seat content on the right. */
.card-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.card-list__center {
  display: flex;
  justify-content: center;
  padding: 8px;
  border-radius: 10px;
  background: rgba(var(--v-theme-success), 0.16);
}
.card-table__seat.card-list__row {
  position: static;
  transform: none;
  width: 100%;
  max-width: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  text-align: left;
}
.card-list__name {
  flex: 0 1 40%;
  justify-content: flex-start;
}
.card-list__content {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  column-gap: 8px;
}

/* Phones: a squarer table and smaller seats, so six seats still fit round it. */
@container (max-width: 520px) {
  .card-table {
    aspect-ratio: 1 / 1.05;
  }
  .card-table__felt {
    inset: 18% 15%;
  }
  .card-table__seat:not(.card-list__row) {
    /* Side seats sit at 13%, so 26% wide just reaches the edge. */
    width: 26%;
    padding: 2px 4px;
  }
  .card-table__name:not(.card-list__name) {
    font-size: 0.75rem;
  }
}
</style>
