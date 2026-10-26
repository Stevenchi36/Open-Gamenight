<template>
  <div>
    <div class="d-flex align-center mb-3 text-body-2 text-medium-emphasis">
      <span>{{ view.totalDice }} dice in play</span>
      <v-spacer />
      <span v-if="myScore !== null">Matches won: <strong>{{ myScore }}</strong></span>
    </div>
    <BiddingPhase v-if="view.phase === 'BIDDING'" v-bind="phaseProps" />
    <RevealPhase v-else-if="view.phase === 'REVEAL'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" v-bind="phaseProps" />

    <!-- Here, not in ResultsPhase: it has to be on screen before RESULTS arrives to see the win happen live. -->
    <WinCelebration
      :active="!!view.winnerId"
      :title="view.winnerId === me ? 'You win the match!' : `${nameOf(room, view.winnerId)} wins!`"
      subtitle="Last dice standing"
      :delay="400"
    />
  </div>
</template>

<script setup lang="ts">
import { nameOf, WinCelebration } from '@wsfg/core/ui'
import { computed } from 'vue'
import BiddingPhase from './phases/BiddingPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import RevealPhase from './phases/RevealPhase.vue'
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
