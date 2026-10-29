<template>
  <div>
    <div class="d-flex align-center ga-3 mb-3 text-body-medium text-medium-emphasis">
      <span>Question {{ view.round }}</span>
      <span v-if="settings.scoreLimit !== null">· First to {{ settings.scoreLimit }}</span>
      <v-spacer />
      <BlackSheep v-if="view.blackSheepId === me" />
      <span v-if="myScore !== null">Your score: <strong>{{ myScore }}</strong></span>
    </div>
    <AnsweringPhase v-if="view.phase === 'ANSWERING'" v-bind="phaseProps" />
    <ReviewPhase v-else-if="view.phase === 'REVIEW'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" v-bind="phaseProps" />

    <!-- Here, not in ResultsPhase: it has to be on screen before RESULTS arrives to see the win happen live. -->
    <WinCelebration
      :active="winnerIds.length > 0"
      :title="winTitle(winnerIds, me, (id) => nameOf(room, id))"
      :subtitle="`First to ${settings.scoreLimit}`"
      :standings="scoreStandings(view.scores, winnerIds, (id) => (id === me ? 'You' : nameOf(room, id)))"
      :delay="600"
    />
  </div>
</template>

<script setup lang="ts">
import { nameOf, scoreStandings, useAnnounce, winTitle, WinCelebration } from '@ogn/core/ui'
import { computed } from 'vue'
import AnsweringPhase from './phases/AnsweringPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import ReviewPhase from './phases/ReviewPhase.vue'
import BlackSheep from './BlackSheep.vue'
import { announceText, roundText } from './announce.ts'
import type { PhaseProps } from './props.ts'

const props = defineProps<PhaseProps>()

// The question, who's answered, and how the flock fell, for screen readers; the first question too
// when the game has just started.
useAnnounce(
  () => props.view,
  (now, before) => announceText(now, before, props.me, (id) => nameOf(props.room, id)),
  (now) => (now.round === 1 && now.phase === 'ANSWERING' && now.answered.length === 0 ? roundText(now) : null),
)

const myScore = computed(() => props.view.scores[props.me] ?? null)
const winnerIds = computed(() => props.view.result?.winnerIds ?? [])
const phaseProps = computed(() => ({
  view: props.view,
  room: props.room,
  me: props.me,
  send: props.send,
  serverNow: props.serverNow,
  settings: props.settings,
}))
</script>
