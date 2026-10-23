<template>
  <div>
    <div class="d-flex align-center ga-3 mb-3 text-body-2 text-medium-emphasis">
      <span>Round {{ view.round }}{{ view.totalRounds !== null ? ` of ${view.totalRounds}` : '' }}</span>
      <v-spacer />
      <span v-if="myScore !== null">Your score: <strong>{{ myScore }}</strong></span>
    </div>
    <GuessingPhase v-if="view.phase === 'GUESSING'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" v-bind="phaseProps" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import GuessingPhase from './phases/GuessingPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
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
