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

    <MixCard compact :colors="view.colors" :target="view.target" :server-now="serverNow" />

    <v-card variant="tonal" class="mb-4">
      <v-card-title class="text-subtitle-1">Guesses, closest first</v-card-title>
      <v-list density="compact" bg-color="transparent">
        <v-list-item v-for="(guess, i) in result.guesses" :key="guess.playerId" :active="guess.playerId === me">
          <template #prepend>
            <span class="mr-3 text-medium-emphasis" style="width: 1.5em">{{ placeOf(i) }}.</span>
            <ColorDot :color="guess.color" :size="32" class="mr-3" />
          </template>
          <v-list-item-title>
            {{ nameOf(room, guess.playerId) }}
            <v-chip v-if="guess.points" size="x-small" color="success" class="ml-1">+{{ guess.points }}</v-chip>
          </v-list-item-title>
          <template #append>
            <span class="text-body-1">{{ guess.closeness.toFixed(2) }}%</span>
          </template>
        </v-list-item>
        <v-list-item v-for="id in noGuess" :key="id">
          <v-list-item-title class="text-medium-emphasis">{{ nameOf(room, id) }}: no guess</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>

    <ScoreBoard :scores="view.scores" :room="room" :gained="result.pointsAwarded" class="mb-4" />

    <NextRoundButton
      :room="room"
      :me="me"
      :label="gameOver ? 'New game' : 'Next round'"
      :waiting-for="gameOver ? 'to start a new game' : 'to start the next round'"
      @next="send({ type: gameOver ? 'new_game' : 'next_round' })"
    />
  </div>
</template>

<script setup lang="ts">
import { nameOf, NextRoundButton, ScoreBoard, StatusCard } from '@wsfg/core/ui'
import { computed } from 'vue'
import ColorDot from '../ColorDot.vue'
import MixCard from '../MixCard.vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const gameOver = computed(() => (result.value?.winnerIds.length ?? 0) > 0)
const noGuess = computed(() => props.view.roundPlayers.filter((id) => !result.value?.guesses.some((g) => g.playerId === id)))

/** Equal distances share a place: 1, 2, 2, 4. */
function placeOf(i: number): number {
  const guesses = result.value?.guesses ?? []
  return guesses.findIndex((g) => g.distance === guesses[i]!.distance) + 1
}

const winnerTitle = computed(() => {
  const ids = result.value?.winnerIds ?? []
  if (ids.includes(props.me)) return ids.length === 1 ? 'You win!' : 'You win, together!'
  return `${ids.map((id) => nameOf(props.room, id)).join(' and ')} win${ids.length === 1 ? 's' : ''}`
})
</script>
