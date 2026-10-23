<template>
  <div>
    <div class="d-flex align-center mb-3 text-body-2 text-medium-emphasis">
      <span>Round {{ view.round }}</span>
      <v-spacer />
      <span v-if="myScore !== null">Your score: <strong>{{ myScore }}</strong></span>
    </div>
    <CluesPhase v-if="view.phase === 'CLUES' && clueMode === 'typed'" v-bind="phaseProps" />
    <SpokenPhase v-else-if="view.phase === 'CLUES'" v-bind="phaseProps" />
    <VotingPhase v-else-if="view.phase === 'VOTING'" v-bind="phaseProps" />
    <RevealPhase v-else-if="view.phase === 'REVEAL'" v-bind="phaseProps" />
    <GuessCheckPhase v-else-if="view.phase === 'GUESS_CHECK'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" v-bind="phaseProps" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CluesPhase from './phases/CluesPhase.vue'
import GuessCheckPhase from './phases/GuessCheckPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import RevealPhase from './phases/RevealPhase.vue'
import SpokenPhase from './phases/SpokenPhase.vue'
import VotingPhase from './phases/VotingPhase.vue'
import type { PhaseProps } from './props.ts'

const props = defineProps<PhaseProps>()

const clueMode = computed(() => props.settings.clueMode)
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

