<template>
  <CardTable
    :room="room"
    :seats="view.seats.map((s) => s.id)"
    :me="me"
    :turn="view.turn"
    :tappable="tappable"
    :selected="selected"
    :dimmed="view.seats.filter((s) => s.left).map((s) => s.id)"
    class="mb-4"
    @select="(id) => emit('select', id)"
  >
    <template #seat="{ id }">
      <div v-if="byId[id]!.left" class="text-caption text-medium-emphasis">left</div>
      <div v-else class="d-flex align-center justify-center my-1" :aria-label="`${byId[id]!.cards} cards`">
        <PlayingCard v-for="i in Math.min(byId[id]!.cards, 4)" :key="i" size="sm" :class="{ 'seat-card--stacked': i > 1 }" />
        <span class="text-caption font-weight-bold ml-1">{{ byId[id]!.cards }}</span>
      </div>
      <div v-if="!byId[id]!.left && (byId[id]!.cards === 1 || points)" class="d-flex flex-wrap justify-center ga-1">
        <span v-if="id === view.exposed" class="seat-tag seat-tag--error">No call!</span>
        <span v-else-if="byId[id]!.cards === 1 && view.phase === 'PLAYING'" class="seat-tag seat-tag--warning">Last card</span>
        <span v-if="points" class="text-caption text-medium-emphasis">{{ byId[id]!.points }} pts</span>
      </div>
    </template>
    <template #center>
      <div class="d-flex align-center justify-center ga-3">
        <div class="d-flex flex-column align-center">
          <PlayingCard />
          <span class="text-caption mt-1">{{ view.drawPile }} left</span>
        </div>
        <LcCard :card="view.top" size="lg" />
        <div class="d-flex flex-column align-center ga-1 text-caption">
          <span class="color-dot" :style="{ background: CARD_COLORS[view.color] }" :aria-label="`Colour in play: ${view.color}`" />
          <span>{{ view.color }}</span>
          <v-icon size="small" :aria-label="view.direction === 1 ? 'Clockwise' : 'Anticlockwise'">
            {{ view.direction === 1 ? 'mdi-rotate-right' : 'mdi-rotate-left' }}
          </v-icon>
          <span v-if="view.pendingDraw > 0" class="seat-tag seat-tag--error">+{{ view.pendingDraw }}</span>
        </div>
      </div>
    </template>
  </CardTable>
</template>

<script setup lang="ts">
// The oval table: each seat's face-down cards (plus the Last card tag and points), and in the
// middle the draw pile, the top card, the colour in play, the direction and any pending stack.
import type { PlayerId } from '@wsfg/core/contract'
import type { RoomView } from '@wsfg/core/protocol'
import { CardTable, PlayingCard } from '@wsfg/core/ui'
import { computed } from 'vue'
import type { LastCardView, Seat } from '../shared/index.ts'
import LcCard from './LcCard.vue'
import { CARD_COLORS } from './text.ts'

const props = withDefaults(
  defineProps<{ view: LastCardView; room: RoomView; me: PlayerId; tappable?: PlayerId[]; selected?: PlayerId | null }>(),
  { tappable: () => [], selected: null },
)
const emit = defineEmits<{ select: [id: PlayerId] }>()

const byId = computed(() => Object.fromEntries(props.view.seats.map((s) => [s.id, s])) as Record<PlayerId, Seat>)
const points = computed(() => props.view.settings.scoring === 'points')
</script>

<style scoped>
.seat-card--stacked {
  margin-left: -14px;
}
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
.color-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgb(var(--v-theme-surface));
  outline: 1px solid rgba(var(--v-theme-on-surface), 0.3);
}
</style>
