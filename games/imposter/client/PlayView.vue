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
    <div v-if="actionNeeded" class="attention-glow" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import type { RoomView } from '@wsfg/core/protocol'
import { computed } from 'vue'
import type { ClientAction, ImposterSettings, ImposterView } from '../shared/index.ts'
import { needsAction } from './attention.ts'
import CluesPhase from './phases/CluesPhase.vue'
import GuessCheckPhase from './phases/GuessCheckPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import RevealPhase from './phases/RevealPhase.vue'
import SpokenPhase from './phases/SpokenPhase.vue'
import VotingPhase from './phases/VotingPhase.vue'

const props = defineProps<{
  view: ImposterView
  send: (action: ClientAction) => void
  me: string
  room: RoomView
  serverNow: () => number
}>()

const clueMode = computed(() => (props.room.game.settings as ImposterSettings).clueMode)
const myScore = computed(() => props.view.scores[props.me] ?? null)
const actionNeeded = computed(() => needsAction(props.view, props.me, props.room.hostId, clueMode.value))
const phaseProps = computed(() => ({
  view: props.view,
  room: props.room,
  me: props.me,
  send: props.send,
  serverNow: props.serverNow,
}))
</script>

<style scoped>
/* Wordless "your move" cue: a pulsing glow around the screen edge, visible from across the table. */
.attention-glow {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1500; /* above the app bar (1004), below dialogs and toasts (2000+) */
  box-shadow: inset 0 0 0 4px rgb(var(--v-theme-primary)), inset 0 0 40px 8px rgba(var(--v-theme-primary), 0.6);
  animation: attention-pulse 1.4s ease-in-out infinite;
}

@keyframes attention-pulse {
  50% {
    opacity: 0.25;
  }
}

@media (prefers-reduced-motion: reduce) {
  .attention-glow {
    animation: none;
  }
}
</style>
