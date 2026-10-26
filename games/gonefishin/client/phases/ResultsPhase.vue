<template>
  <div>
    <StatusCard v-if="view.outcome === 'abandoned'" compact title="Game over">Not enough players were left to finish it.</StatusCard>
    <StatusCard v-else prominent :color="iWon ? 'success' : undefined" overline="All 13 books are down" :title="headline">
      {{ topBooks }} {{ topBooks === 1 ? 'book' : 'books' }}{{ view.winnerIds.length > 1 ? ' each' : '' }}
    </StatusCard>

    <FishTable :view="view" :room="room" :me="me" />

    <ScoreBoard :scores="view.scores" :room="room" :gained="gained" class="mb-4" />

    <NextRoundButton :room="room" :me="me" label="New game" waiting-for="to start a new game" @next="send({ type: 'new_game' })" />
  </div>
</template>

<script setup lang="ts">
import { nameOf, NextRoundButton, ScoreBoard, StatusCard } from '@wsfg/core/ui'
import { computed } from 'vue'
import FishTable from '../FishTable.vue'
import type { PhaseProps } from '../props.ts'
import { resultTitle } from '../text.ts'

const props = defineProps<PhaseProps>()

const iWon = computed(() => props.view.winnerIds.includes(props.me))
const topBooks = computed(() => props.view.seats.find((s) => s.id === props.view.winnerIds[0])?.books.length ?? 0)
const headline = computed(() => resultTitle(props.view, props.me, (id) => nameOf(props.room, id)))
const gained = computed(() => Object.fromEntries(props.view.winnerIds.map((id) => [id, 1])))
</script>
