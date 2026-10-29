<template>
  <div v-if="result">
    <StatusCard
      v-if="gameOver"
      prominent
      :color="result.winnerIds.includes(me) ? 'success' : undefined"
      overline="Game over"
      :title="winnerTitle"
    >
      Highest score after {{ view.totalRounds }} round{{ view.totalRounds === 1 ? '' : 's' }}.
    </StatusCard>

    <StatusCard compact :color="gained > 0 ? 'success' : undefined" :overline="view.question.text" :title="formatValue(result.answer, view.question.unit)">
      <div v-if="result.fact" class="text-body-medium mb-1">{{ result.fact }}</div>
      <div>{{ headline }}</div>
    </StatusCard>

    <SlotBoard
      v-if="view.slots.length"
      :slots="view.slots"
      :unit="view.question.unit"
      :room="room"
      :me="me"
      :bets="view.bets"
      :winning-ids="result.winningSlotIds"
    />
    <div v-else class="text-body-medium text-medium-emphasis text-center mb-4">Nobody guessed.</div>

    <ScoreBoard :scores="view.scores" :room="room" :gained="result.pointsAwarded" class="mb-4" />

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
import { closestText } from '../announce.ts'
import { formatValue } from '../format.ts'
import SlotBoard from '../SlotBoard.vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const gameOver = computed(() => (result.value?.winnerIds.length ?? 0) > 0)
const gained = computed(() => result.value?.pointsAwarded[props.me] ?? 0)

const headline = computed(() => closestText(props.view, props.me, (id) => nameOf(props.room, id), props.settings.winRule))

const winnerTitle = computed(() => {
  const ids = result.value?.winnerIds ?? []
  if (ids.includes(props.me)) return ids.length === 1 ? 'You win!' : 'You win, together!'
  return `${ids.map((id) => nameOf(props.room, id)).join(' and ')} win${ids.length === 1 ? 's' : ''}`
})
</script>
