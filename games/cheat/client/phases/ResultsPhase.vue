<template>
  <div>
    <StatusCard v-if="view.outcome === 'abandoned'" compact title="Game over">Not enough players were left to finish it.</StatusCard>
    <StatusCard v-else prominent :color="iWon ? 'success' : undefined" overline="Out of cards" :title="headline">
      {{ last ? moveText(last, me, (id) => nameOf(room, id)) : '' }}
    </StatusCard>

    <CheatTable :view="view" :room="room" :me="me" />

    <ScoreBoard :scores="view.scores" :room="room" :gained="gained" class="mb-4" />

    <NextRoundButton :room="room" :me="me" label="New game" waiting-for="to start a new game" @next="send({ type: 'new_game' })" />
  </div>
</template>

<script setup lang="ts">
import { nameOf, NextRoundButton, ScoreBoard, StatusCard } from '@wsfg/core/ui'
import { computed } from 'vue'
import CheatTable from '../CheatTable.vue'
import type { PhaseProps } from '../props.ts'
import { moveText } from '../text.ts'

const props = defineProps<PhaseProps>()

const iWon = computed(() => props.view.winnerId === props.me)
const headline = computed(() => (iWon.value ? 'You win!' : `${nameOf(props.room, props.view.winnerId)} wins`))
const last = computed(() => props.view.log.at(-1) ?? null)
const gained = computed(() => (props.view.winnerId ? { [props.view.winnerId]: 1 } : {}))
</script>
