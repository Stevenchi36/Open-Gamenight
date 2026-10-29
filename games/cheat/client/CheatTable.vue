<template>
  <CardTable
    :room="room"
    :seats="view.seats.map((s) => s.id)"
    :me="me"
    :turn="view.turn"
    :dimmed="view.seats.filter((s) => s.left).map((s) => s.id)"
    :layout="layout"
    :flights="flights"
    class="mb-4"
  >
    <template #seat="{ id }">
      <div v-if="byId[id]!.left" class="text-body-small text-medium-emphasis">left</div>
      <div v-else-if="byId[id]!.cards === 0" class="text-body-small font-weight-bold text-success my-1">out of cards</div>
      <CardCount v-else :count="byId[id]!.cards" />
    </template>
    <template #center>
      <div v-if="view.pile > 0" class="d-flex align-center ga-2">
        <PlayingCard />
        <div class="text-body-medium text-left">
          <strong>{{ view.pile }}</strong> in the pile
          <div v-if="view.top" class="text-body-small">
            Last: <strong>{{ view.top.count }} × {{ view.top.claim }}</strong>
          </div>
        </div>
      </div>
      <div v-else class="text-body-medium text-medium-emphasis">The pile is empty</div>
    </template>
  </CardTable>
</template>

<script setup lang="ts">
// The oval table: each seat's face-down card count, the pile and the latest claim in the middle.
import type { PlayerId } from '@ogn/core/contract'
import type { RoomView } from '@ogn/core/protocol'
import { CardCount, CardTable, PlayingCard } from '@ogn/core/ui'
import { computed } from 'vue'
import type { CheatView, Seat } from '../shared/index.ts'
import { tableFlights } from './flights.ts'

const props = defineProps<{ view: CheatView; room: RoomView; me: PlayerId; layout?: 'table' | 'list' }>()

const byId = computed(() => Object.fromEntries(props.view.seats.map((s) => [s.id, s])) as Record<PlayerId, Seat>)
const flights = computed(() => tableFlights(props.view))
</script>

