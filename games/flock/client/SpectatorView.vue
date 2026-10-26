<template>
  <SpectatorLayout>
    <template v-if="view.phase === 'ANSWERING'">
      <QuestionCard :question="view.question" :deadline="view.deadline" :server-now="serverNow" />
      <WhoAnswered :room="room" :players="view.roundPlayers" :done="view.answered" label="answered" large />
    </template>
    <template v-else>
      <StatusCard v-if="gameOver" prominent color="success" overline="Game over" :title="winnerTitle">
        First to {{ settings.scoreLimit }} point{{ settings.scoreLimit === 1 ? '' : 's' }}.
      </StatusCard>
      <StatusCard v-if="view.phase === 'REVIEW'" compact color="primary" :overline="view.question.category" :title="view.question.text">
        {{ name(room.hostId) }} is checking for answers that mean the same thing.
      </StatusCard>
      <StatusCard v-else prominent :color="flock ? 'success' : undefined" :overline="view.question.text" :title="flock ? flock.label : 'No flock'">
        {{ flockSummary(view, 'final') }}
      </StatusCard>

      <v-alert v-if="blackSheepMoved" variant="tonal" color="grey" class="mb-4 text-title-large">
        <template #prepend><BlackSheep size="large" /></template>
        {{ name(view.result!.blackSheepTo) }} was the only odd one out, so they're the black sheep now.
      </v-alert>

      <GroupList :groups="view.groups" :flock-id="view.flockId" :room="room" :stagger="stagger" class="tv-groups" />
      <div v-if="view.phase === 'REVIEW'" class="text-title-large text-center mb-4">{{ flockSummary(view, 'so far') }}</div>
    </template>

    <template #side>
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-label-large">Question {{ view.round }}</div>
          <div class="text-headline-small">{{ settings.scoreLimit !== null ? `First to ${settings.scoreLimit}` : 'Open-ended game' }}</div>
          <div v-if="view.blackSheepId" class="d-flex align-center ga-2 text-body-large mt-2">
            <BlackSheep /> {{ name(view.blackSheepId) }} is the black sheep
          </div>
        </v-card-text>
      </v-card>

      <ScoreBoard :scores="view.scores" :room="room" :gained="view.result?.pointsAwarded">
        <template #badge="{ id }"><BlackSheep v-if="id === view.blackSheepId" class="ml-1" /></template>
      </ScoreBoard>
    </template>

    <WinCelebration
      :active="gameOver"
      :title="winnerTitle"
      :subtitle="`First to ${settings.scoreLimit}`"
      :standings="scoreStandings(view.scores, view.result?.winnerIds ?? [], name)"
      :delay="600"
    />
  </SpectatorLayout>
</template>

<script setup lang="ts">
// The watch page's Flock: the question big with who has answered (never what), then the
// answers dropping in as their groups with the flock highlighted, the black sheep and the scores.
// It's the view built for SPECTATOR_ID, so it never has an answer of its own.
import type { SpectatorViewProps } from '@wsfg/core/client'
import type { PlayerId } from '@wsfg/core/contract'
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { nameOf, ScoreBoard, scoreStandings, SpectatorLayout, StatusCard, WhoAnswered, WinCelebration, winTitle } from '@wsfg/core/ui'
import { computed, ref, watch } from 'vue'
import type { FlockSettings, FlockView } from '../shared/index.ts'
import BlackSheep from './BlackSheep.vue'
import { flockSummary } from './flock-summary.ts'
import GroupList from './GroupList.vue'
import QuestionCard from './QuestionCard.vue'

const props = defineProps<SpectatorViewProps<FlockView, FlockSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const flock = computed(() => props.view.groups.find((g) => g.id === props.view.flockId) ?? null)
const gameOver = computed(() => (props.view.result?.winnerIds.length ?? 0) > 0)
const winnerTitle = computed(() => winTitle(props.view.result?.winnerIds ?? [], SPECTATOR_ID, name))
const blackSheepMoved = computed(() => !!props.view.result && props.view.result.blackSheepTo !== props.view.result.blackSheepFrom)

// The groups drop in one by one when the answers are revealed live, not when the TV opens on them.
const stagger = ref(false)
watch(
  () => props.view.phase,
  (now, before) => {
    if (now === 'ANSWERING') stagger.value = false
    else if (before === 'ANSWERING') stagger.value = true
  },
)
</script>

<style scoped>
.tv-groups :deep(.text-body-large) {
  font-size: 1.375rem !important;
}
.tv-groups :deep(.text-body-medium) {
  font-size: 1rem !important;
}
</style>
