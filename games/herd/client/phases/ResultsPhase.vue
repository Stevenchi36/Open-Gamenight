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

    <StatusCard compact :color="inHerd ? 'success' : undefined" :overline="view.question.text" :title="headline">
      {{ herdLine }}
    </StatusCard>

    <v-alert v-if="pinkCowMoved" variant="tonal" color="pink" class="mb-4">
      <template #prepend><PinkCow size="large" /></template>
      {{ pinkCowLine }}
    </v-alert>

    <GroupList :groups="view.groups" :herd-id="view.herdId" :room="room" />

    <ScoreBoard :scores="view.scores" :room="room" :gained="result.pointsAwarded" class="mb-4">
      <template #badge="{ id }"><PinkCow v-if="id === view.pinkCowId" class="ml-1" /></template>
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
import { nameOf, NextRoundButton, ScoreBoard, StatusCard } from '@wsfg/core/ui'
import { computed } from 'vue'
import GroupList from '../GroupList.vue'
import PinkCow from '../PinkCow.vue'
import { herdSummary } from '../herd-summary.ts'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const gameOver = computed(() => (result.value?.winnerIds.length ?? 0) > 0)
const inHerd = computed(() => (result.value?.pointsAwarded[props.me] ?? 0) > 0)
const herdLine = computed(() => herdSummary(props.view, 'final'))

const headline = computed(() => {
  if (props.view.you.status === 'waiting') return 'Round over'
  if (inHerd.value) return 'You followed the herd!'
  return props.view.herdId ? 'You strayed from the herd' : 'Nobody scores'
})

const winnerTitle = computed(() => {
  const ids = result.value?.winnerIds ?? []
  if (ids.includes(props.me)) return ids.length === 1 ? 'You win!' : 'You win, together!'
  return `${ids.map((id) => nameOf(props.room, id)).join(' and ')} win${ids.length === 1 ? 's' : ''}`
})

const pinkCowMoved = computed(() => result.value && result.value.pinkCowTo !== result.value.pinkCowFrom)
const pinkCowLine = computed(() => {
  const to = result.value?.pinkCowTo
  const who = to === props.me ? 'You were' : `${nameOf(props.room, to)} was`
  const suffix = props.settings.scoreLimit !== null ? " Whoever holds it can't win." : ''
  return `${who} the only odd one out, so ${to === props.me ? 'you take' : 'they take'} the pink cow.${suffix}`
})
</script>
