<template>
  <div v-if="result">
    <StatusCard
      v-if="result.winnerIds.length > 0"
      prominent
      :color="result.winnerIds.includes(me) ? 'success' : undefined"
      overline="Game over"
      :title="winnerTitle"
    >
      First to {{ settings.scoreLimit }} point{{ settings.scoreLimit === 1 ? '' : 's' }}.
    </StatusCard>

    <StatusCard compact :color="inFlock ? 'success' : undefined" :overline="view.question.text" :title="headline">
      {{ flockLine }}
    </StatusCard>

    <v-alert v-if="blackSheepMoved" variant="tonal" color="grey" class="mb-4">
      <template #prepend><BlackSheep size="large" /></template>
      {{ blackSheepLine }}
    </v-alert>

    <GroupList :groups="view.groups" :flock-id="view.flockId" :room="room" />

    <ScoreBoard :scores="view.scores" :room="room" :gained="result.pointsAwarded" class="mb-4">
      <template #badge="{ id }"><BlackSheep v-if="id === view.blackSheepId" class="ml-1" /></template>
    </ScoreBoard>

    <NextRoundButton
      :room="room"
      :me="me"
      :label="gameOver ? 'New game' : 'Next question'"
      :waiting-for="gameOver ? 'to start a new game' : 'to ask the next question'"
      @next="send({ type: gameOver ? 'new_game' : 'next_round' })"
    />
  </div>
</template>

<script setup lang="ts">
import { nameOf, NextRoundButton, ScoreBoard, StatusCard } from '@ogn/core/ui'
import { computed } from 'vue'
import GroupList from '../GroupList.vue'
import BlackSheep from '../BlackSheep.vue'
import { flockSummary } from '../flock-summary.ts'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const gameOver = computed(() => (result.value?.winnerIds.length ?? 0) > 0)
const inFlock = computed(() => (result.value?.pointsAwarded[props.me] ?? 0) > 0)
const flockLine = computed(() => flockSummary(props.view, 'final'))

const headline = computed(() => {
  if (props.view.you.status === 'waiting') return 'Round over'
  if (inFlock.value) return 'You followed the flock!'
  return props.view.flockId ? 'You strayed from the flock' : 'Nobody scores'
})

const winnerTitle = computed(() => {
  const ids = result.value?.winnerIds ?? []
  if (ids.includes(props.me)) return ids.length === 1 ? 'You win!' : 'You win, together!'
  return `${ids.map((id) => nameOf(props.room, id)).join(' and ')} win${ids.length === 1 ? 's' : ''}`
})

const blackSheepMoved = computed(() => result.value && result.value.blackSheepTo !== result.value.blackSheepFrom)
const blackSheepLine = computed(() => {
  const to = result.value?.blackSheepTo
  const who = to === props.me ? 'You were' : `${nameOf(props.room, to)} was`
  const suffix = props.settings.scoreLimit !== null ? " The black sheep can't win." : ''
  return `${who} the only odd one out, so ${to === props.me ? "you're" : "they're"} the black sheep now.${suffix}`
})
</script>
