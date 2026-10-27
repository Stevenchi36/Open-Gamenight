<template>
  <SpectatorLayout>
    <template v-if="view.phase === 'GUESSING'">
      <MixCard :colors="view.colors" :deadline="view.deadline" :server-now="serverNow" />
      <WhoAnswered :room="room" :players="view.roundPlayers" :done="view.guessed" label="guessed" large />
    </template>
    <template v-else-if="result">
      <StatusCard v-if="gameOver" prominent color="success" overline="Game over" :title="winnerTitle">
        Highest score after {{ view.totalRounds }} round{{ view.totalRounds === 1 ? '' : 's' }}.
      </StatusCard>
      <MixCard :colors="view.colors" :target="view.target" :server-now="serverNow" />

      <v-card variant="tonal" class="mb-4">
        <v-card-title class="text-title-large">Guesses, closest first</v-card-title>
        <div class="pa-2">
          <div
            v-for="(guess, i) in result.guesses"
            :key="guess.playerId"
            class="guess d-flex align-center ga-4 px-3 py-2"
            :class="{ 'guess--in': stagger }"
            :style="stagger ? { animationDelay: `${(result.guesses.length - 1 - i) * 350}ms` } : undefined"
          >
            <span class="text-title-large text-medium-emphasis" style="min-width: 1.5em">{{ placeOf(i) }}.</span>
            <ColorDot :color="guess.color" :size="56" />
            <span class="text-title-large flex-grow-1">
              {{ name(guess.playerId) }}
              <v-chip v-if="guess.points" color="success" class="ml-1">+{{ guess.points }}</v-chip>
            </span>
            <span class="text-headline-small font-weight-bold">{{ guess.closeness.toFixed(2) }}%</span>
          </div>
          <div v-for="id in noGuess" :key="id" class="text-body-large text-medium-emphasis px-3 py-2">{{ name(id) }}: no guess</div>
        </div>
      </v-card>
    </template>

    <template #side>
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-label-large">Color Mix</div>
          <div class="text-headline-small">Round {{ view.round }}{{ view.totalRounds !== null ? ` of ${view.totalRounds}` : '' }}</div>
        </v-card-text>
      </v-card>
      <ScoreBoard :scores="view.scores" :room="room" :gained="result?.pointsAwarded" />
    </template>

    <WinCelebration
      :active="gameOver"
      :title="winnerTitle"
      subtitle="Highest score"
      :standings="scoreStandings(view.scores, result?.winnerIds ?? [], name)"
      :delay="revealTime"
    />
  </SpectatorLayout>
</template>

<script setup lang="ts">
// The watch page's Color Mix: the colours to mix big with who has guessed (never what), then the
// real mix against every guess, dropping in from the furthest so the closest lands last.
// It's the view built for SPECTATOR_ID, so it never has a guess of its own.
import type { SpectatorViewProps } from '@ogn/core/client'
import type { PlayerId } from '@ogn/core/contract'
import { SPECTATOR_ID } from '@ogn/core/protocol'
import { nameOf, ScoreBoard, scoreStandings, SpectatorLayout, StatusCard, WhoAnswered, WinCelebration, winTitle } from '@ogn/core/ui'
import { computed, ref, watch } from 'vue'
import type { ColorMixSettings, ColorMixView } from '../shared/index.ts'
import ColorDot from './ColorDot.vue'
import MixCard from './MixCard.vue'

const props = defineProps<SpectatorViewProps<ColorMixView, ColorMixSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const result = computed(() => props.view.result)
const gameOver = computed(() => (result.value?.winnerIds.length ?? 0) > 0)
const winnerTitle = computed(() => winTitle(result.value?.winnerIds ?? [], SPECTATOR_ID, name))
const noGuess = computed(() => props.view.roundPlayers.filter((id) => !result.value?.guesses.some((g) => g.playerId === id)))

/** Equal distances share a place: 1, 2, 2, 4. */
function placeOf(i: number): number {
  const guesses = result.value?.guesses ?? []
  return guesses.findIndex((g) => g.distance === guesses[i]!.distance) + 1
}

// The guesses drop in when revealed live, not when the TV opens on the results.
const stagger = ref(false)
watch(
  () => props.view.phase,
  (now, before) => {
    stagger.value = now === 'RESULTS' && before === 'GUESSING'
  },
)
// The win card waits for the closest guess to land.
const revealTime = computed(() => (stagger.value ? (result.value?.guesses.length ?? 0) * 350 + 400 : 400))
</script>

<style scoped>
.guess {
  border-radius: 8px;
}
.guess--in {
  animation: guess-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
@keyframes guess-in {
  from {
    transform: translateX(-24px) scale(0.9);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .guess--in {
    animation: none;
  }
}
</style>
