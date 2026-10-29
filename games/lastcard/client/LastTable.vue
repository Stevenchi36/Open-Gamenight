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
      <CardCount v-else :count="byId[id]!.cards" />
      <div v-if="!byId[id]!.left && (byId[id]!.cards === 1 || points)" class="d-flex flex-wrap justify-center ga-1">
        <span v-if="id === view.exposed" class="seat-tag seat-tag--error">No call!</span>
        <span v-else-if="byId[id]!.cards === 1 && view.phase === 'PLAYING'" class="seat-tag seat-tag--warning">Last card</span>
        <span v-if="points" class="text-body-small text-medium-emphasis">{{ byId[id]!.points }} pts</span>
      </div>
    </template>
    <template #center>
      <div class="d-flex align-center justify-center ga-3">
        <div class="d-flex flex-column align-center">
          <PlayingCard data-card-anchor="draw" />
          <span class="text-body-small mt-1">{{ view.drawPile }} left</span>
        </div>
        <div data-card-anchor="discard">
          <LcCard v-if="shownTop" :card="shownTop" size="lg" />
          <div v-else class="discard-empty" />
        </div>
        <div class="d-flex flex-column align-center ga-1 text-body-small">
          <span class="color-dot" :style="{ background: CARD_COLORS[view.color] }" :aria-label="`Colour in play: ${view.color}`" />
          <span>{{ view.color }}</span>
          <v-icon size="small" :aria-label="view.direction === 1 ? 'Clockwise' : 'Anticlockwise'">
            {{ view.direction === 1 ? 'mdi-rotate-right' : 'mdi-rotate-left' }}
          </v-icon>
          <span v-if="view.pendingDraw > 0" class="seat-tag seat-tag--error">+{{ view.pendingDraw }}</span>
        </div>
      </div>
    </template>
    <template #flight="{ face }">
      <LcCard :card="face as Card" />
    </template>
  </CardTable>
</template>

<script setup lang="ts">
// The oval table: each seat's face-down cards (plus the Last card tag and points), and in the
// middle the draw pile, the top card, the colour in play, the direction and any pending stack.
import type { PlayerId } from '@ogn/core/contract'
import type { RoomView } from '@ogn/core/protocol'
import { CardCount, CardTable, PlayingCard, reducedMotion } from '@ogn/core/ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { sameCard, type LastCardView, type LcCard as Card, type Seat } from '../shared/index.ts'
import { tableFlights, topDelay } from './flights.ts'
import LcCard from './LcCard.vue'
import { CARD_COLORS } from './text.ts'

const props = withDefaults(
  defineProps<{ view: LastCardView; room: RoomView; me: PlayerId; tappable?: PlayerId[]; selected?: PlayerId | null; layout?: 'table' | 'list' }>(),
  { tappable: () => [], selected: null },
)
const emit = defineEmits<{ select: [id: PlayerId] }>()

const byId = computed(() => Object.fromEntries(props.view.seats.map((s) => [s.id, s])) as Record<PlayerId, Seat>)
const points = computed(() => props.view.settings.scoring === 'points')
const flights = computed(() => tableFlights(props.view, props.me))

// The top card changes as the played card lands on it, not as it leaves the hand; at the
// start of a round the pile stays empty until the first card is turned up after the deal.
const dealing = props.view.log.length === 0 && !reducedMotion()
const shownTop = ref<Card | null>(dealing ? null : props.view.top)
let pending: Card | null = dealing ? props.view.top : null
let timer: ReturnType<typeof setTimeout> | undefined
const showLater = (ms: number) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    shownTop.value = props.view.top
    pending = null
  }, ms)
}
onMounted(() => dealing && showLater(topDelay(props.view)))
watch(
  () => props.view.top,
  (top) => {
    const target = pending ?? shownTop.value
    if (target && sameCard(top, target)) return
    if (reducedMotion()) {
      shownTop.value = top
      return
    }
    pending = top
    showLater(topDelay(props.view))
  },
)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.seat-tag {
  padding: 0 4px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.4;
}
.seat-tag--warning {
  background: rgba(var(--v-theme-warning), 0.2);
  border: 1px solid rgba(var(--v-theme-warning), 0.7);
}
.seat-tag--error {
  background: rgba(var(--v-theme-error), 0.2);
  border: 1px solid rgba(var(--v-theme-error), 0.7);
}
/* Where the first card will land, while the deal goes round. */
.discard-empty {
  width: 64px;
  height: 92px;
  border-radius: 6px;
  border: 2px dashed rgba(var(--v-theme-on-surface), 0.25);
}
.color-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgb(var(--v-theme-surface));
  outline: 1px solid rgba(var(--v-theme-on-surface), 0.3);
}
</style>
