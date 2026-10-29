<template>
  <CardTable
    :room="room"
    :seats="view.seats.map((s) => s.id)"
    :me="me"
    :turn="view.turn"
    :selected="view.from"
    :dimmed="view.seats.filter((s) => s.left || s.eliminated).map((s) => s.id)"
    :flights="flights"
    :layout="layout"
    class="mb-4"
  >
    <template #seat="{ id }">
      <div v-if="byId[id]!.left" class="text-body-small text-medium-emphasis">left</div>
      <div v-else-if="byId[id]!.eliminated" class="text-body-small text-medium-emphasis">eliminated</div>
      <div v-else-if="!byId[id]!.inRound" class="text-body-small text-medium-emphasis">next game</div>
      <div v-else-if="byId[id]!.outPlace !== null" class="my-1"><span class="out-tag">Out · {{ ordinal(byId[id]!.outPlace!) }}</span></div>
      <CardCount v-else :count="byId[id]!.cards" />
      <div v-if="id === view.from" class="text-body-small text-primary font-weight-bold">drawn from</div>
    </template>
    <template #center>
      <div class="d-flex align-center ga-2" data-card-anchor="discard">
        <template v-if="top">
          <div class="d-flex">
            <PlayingCard :card="top[0]" />
            <PlayingCard :card="top[1]" class="discard-card--stacked" />
          </div>
          <div class="text-body-medium text-left">
            <strong>{{ view.discard.length }}</strong><br />
            {{ view.discard.length === 1 ? 'pair' : 'pairs' }} down
          </div>
        </template>
        <div v-else class="text-body-medium text-medium-emphasis">No pairs down yet</div>
      </div>
    </template>
  </CardTable>
</template>

<script setup lang="ts">
// The oval table: each seat's face-down card count (or out / eliminated), the seat being drawn
// from highlighted, and the discard pile of pairs in the middle.
import type { PlayerId } from '@ogn/core/contract'
import type { RoomView } from '@ogn/core/protocol'
import { CardCount, CardTable, ordinal, PlayingCard } from '@ogn/core/ui'
import { computed } from 'vue'
import type { OldMaidView, Seat } from '../shared/index.ts'
import { tableFlights } from './flights.ts'

const props = defineProps<{ view: OldMaidView; room: RoomView; me: PlayerId; layout?: 'table' | 'list' }>()

const byId = computed(() => Object.fromEntries(props.view.seats.map((s) => [s.id, s])) as Record<PlayerId, Seat>)
const top = computed(() => props.view.discard.at(-1) ?? null)
const flights = computed(() => tableFlights(props.view))
</script>

<style scoped>
.discard-card--stacked {
  margin-left: -26px;
  transform: rotate(8deg);
}
.out-tag {
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(var(--v-theme-success), 0.2);
  border: 1px solid rgba(var(--v-theme-success), 0.6);
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.4;
}
</style>
