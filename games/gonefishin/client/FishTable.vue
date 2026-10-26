<template>
  <CardTable
    :room="room"
    :seats="view.seats.map((s) => s.id)"
    :me="me"
    :turn="view.turn"
    :tappable="tappable"
    :selected="selected"
    :dimmed="view.seats.filter((s) => s.left).map((s) => s.id)"
    :flights="flights"
    :layout="layout"
    class="mb-4"
    @select="(id) => emit('select', id)"
  >
    <template #seat="{ id }">
      <div v-if="byId[id]!.left" class="text-body-small text-medium-emphasis">left</div>
      <div v-else-if="byId[id]!.cards === 0" class="text-body-small text-medium-emphasis my-1">no cards</div>
      <div v-else class="d-flex align-center justify-center my-1" :aria-label="`${byId[id]!.cards} cards`">
        <PlayingCard v-for="i in Math.min(byId[id]!.cards, 4)" :key="i" size="sm" :class="{ 'seat-card--stacked': i > 1 }" />
        <span class="text-body-small font-weight-bold ml-1">{{ byId[id]!.cards }}</span>
      </div>
      <!-- Always there (even empty), so a seat's first book pops in like the rest. -->
      <TransitionGroup
        tag="div"
        name="book-pop"
        class="d-flex flex-wrap justify-center ga-1"
        :aria-label="byId[id]!.books.length > 0 ? `Books: ${byId[id]!.books.map((r) => rankName(r)).join(', ')}` : undefined"
      >
        <span v-for="rank in byId[id]!.books" :key="rank" class="book-tag">{{ rank }}</span>
      </TransitionGroup>
    </template>
    <template #center>
      <div v-if="view.pond > 0" class="d-flex align-center ga-2">
        <PlayingCard />
        <div class="text-body-medium text-left">
          <strong>{{ view.pond }}</strong><br />
          in the pond
        </div>
      </div>
      <div v-else class="text-body-medium text-medium-emphasis">The pond is empty</div>
    </template>
  </CardTable>
</template>

<script setup lang="ts">
// The oval table: each seat's face-down card count and books, the pond in the middle.
import type { PlayerId } from '@wsfg/core/contract'
import { rankName } from '@wsfg/core/kit'
import type { RoomView } from '@wsfg/core/protocol'
import { CardTable, PlayingCard } from '@wsfg/core/ui'
import { computed } from 'vue'
import type { GoneFishinView, Seat } from '../shared/index.ts'
import { tableFlights } from './flights.ts'

const props = withDefaults(
  defineProps<{ view: GoneFishinView; room: RoomView; me: PlayerId; tappable?: PlayerId[]; selected?: PlayerId | null; layout?: 'table' | 'list' }>(),
  { tappable: () => [], selected: null },
)
const emit = defineEmits<{ select: [id: PlayerId] }>()

const byId = computed(() => Object.fromEntries(props.view.seats.map((s) => [s.id, s])) as Record<PlayerId, Seat>)
const flights = computed(() => tableFlights(props.view))
</script>

<style scoped>
.seat-card--stacked {
  margin-left: -14px;
}
/* A book: the rank on a small tag, so it can't be read as a card count. */
.book-tag {
  min-width: 1.6em;
  padding: 0 3px;
  /* Its own centring: list rows are left-aligned, and a one-character rank would hug the left edge. */
  text-align: center;
  border-radius: 4px;
  background: rgba(var(--v-theme-success), 0.2);
  border: 1px solid rgba(var(--v-theme-success), 0.6);
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.4;
}
/* A new book pops onto the seat once the cards that made it have landed. */
.book-pop-enter-active {
  animation: book-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.45s backwards;
}
@keyframes book-pop {
  from {
    opacity: 0;
    transform: scale(0) rotate(-25deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .book-pop-enter-active {
    animation: none;
  }
}
</style>
