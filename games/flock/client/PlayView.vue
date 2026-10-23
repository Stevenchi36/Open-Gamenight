<template>
  <div>
    <div class="d-flex align-center ga-3 mb-3 text-body-2 text-medium-emphasis">
      <span>Question {{ view.round }}</span>
      <span v-if="settings.scoreLimit !== null">· First to {{ settings.scoreLimit }}</span>
      <v-spacer />
      <BlackSheep v-if="view.blackSheepId === me" />
      <span v-if="myScore !== null">Your score: <strong>{{ myScore }}</strong></span>
    </div>
    <AnsweringPhase v-if="view.phase === 'ANSWERING'" v-bind="phaseProps" />
    <ReviewPhase v-else-if="view.phase === 'REVIEW'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" v-bind="phaseProps" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AnsweringPhase from './phases/AnsweringPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import ReviewPhase from './phases/ReviewPhase.vue'
import BlackSheep from './BlackSheep.vue'
import type { PhaseProps } from './props.ts'

const props = defineProps<PhaseProps>()

const myScore = computed(() => props.view.scores[props.me] ?? null)
const phaseProps = computed(() => ({
  view: props.view,
  room: props.room,
  me: props.me,
  send: props.send,
  serverNow: props.serverNow,
  settings: props.settings,
}))
</script>
