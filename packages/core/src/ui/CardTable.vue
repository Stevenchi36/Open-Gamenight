<template>
  <div class="card-table-wrap">
    <div class="card-table">
      <div class="card-table__felt">
        <slot name="center" />
      </div>
      <component
        :is="isTappable(seat.id) ? 'button' : 'div'"
        v-for="seat in placed"
        :key="seat.id"
        :type="isTappable(seat.id) ? 'button' : undefined"
        class="card-table__seat"
        :class="{
          'card-table__seat--turn': seat.id === turn,
          'card-table__seat--tappable': isTappable(seat.id),
          'card-table__seat--selected': seat.id === selected,
          'card-table__seat--dimmed': dimmed.includes(seat.id),
        }"
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
  </div>
</template>

<script setup lang="ts">
// Players round an oval table in seat order, clockwise, turned so the viewer sits at the bottom.
// The game fills each seat (`seat` slot) and the middle (`center`); seats in `tappable` can be picked.
import { computed } from 'vue'
import type { PlayerId } from '../contract.ts'
import type { RoomView } from '../protocol.ts'
import { isConnected, nameOf } from './helpers.ts'

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

const isTappable = (id: PlayerId) => props.tappable.includes(id)

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
/* Phones: a squarer table and smaller seats, so six seats still fit round it. */
@container (max-width: 520px) {
  .card-table {
    aspect-ratio: 1 / 1.05;
  }
  .card-table__felt {
    inset: 18% 15%;
  }
  .card-table__seat {
    /* Side seats sit at 13%, so 26% wide just reaches the edge. */
    width: 26%;
    padding: 2px 4px;
  }
  .card-table__name {
    font-size: 0.75rem;
  }
}
</style>
