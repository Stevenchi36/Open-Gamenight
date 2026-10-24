<template>
  <div>
    <div class="d-flex align-center mb-3 text-body-2 text-medium-emphasis">
      <span v-if="points">Game {{ view.game }} · first to {{ view.settings.target }}</span>
      <span v-else>Round {{ view.round }}</span>
      <v-spacer />
      <span v-if="myScore !== null">{{ points ? 'Games won' : 'Rounds won' }}: <strong>{{ myScore }}</strong></span>
    </div>
    <PlayingPhase v-if="view.phase === 'PLAYING'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" v-bind="phaseProps" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PlayingPhase from './phases/PlayingPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import type { PhaseProps } from './props.ts'

const props = defineProps<PhaseProps>()

const points = computed(() => props.view.settings.scoring === 'points')
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
