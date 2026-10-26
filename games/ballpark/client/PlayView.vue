<template>
  <div>
    <div class="d-flex align-center ga-3 mb-3 text-body-medium text-medium-emphasis">
      <span>Question {{ view.round }}{{ view.totalRounds !== null ? ` of ${view.totalRounds}` : '' }}</span>
      <v-spacer />
      <span v-if="myScore !== null">{{ settings.scoring === 'chips' ? 'Your chips' : 'Your score' }}: <strong>{{ myScore }}</strong></span>
    </div>
    <GuessingPhase v-if="view.phase === 'GUESSING'" v-bind="phaseProps" />
    <BettingPhase v-else-if="view.phase === 'BETTING'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" v-bind="phaseProps" />

    <!-- Here, not in ResultsPhase: it has to be on screen before RESULTS arrives to see the win happen live. -->
    <WinCelebration
      :active="winnerIds.length > 0"
      :title="winTitle(winnerIds, me, (id) => nameOf(room, id))"
      :subtitle="chips ? 'Most chips' : 'Highest score'"
      :standings="scoreStandings(view.scores, winnerIds, (id) => (id === me ? 'You' : nameOf(room, id)), unitOf)"
      :delay="600"
    />
  </div>
</template>

<script setup lang="ts">
import { nameOf, scoreStandings, winTitle, WinCelebration } from '@wsfg/core/ui'
import { computed } from 'vue'
import BettingPhase from './phases/BettingPhase.vue'
import GuessingPhase from './phases/GuessingPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import type { PhaseProps } from './props.ts'

const props = defineProps<PhaseProps>()

const myScore = computed(() => props.view.scores[props.me] ?? null)
const winnerIds = computed(() => props.view.result?.winnerIds ?? [])
const chips = computed(() => props.settings.scoring === 'chips')
const unitOf = (n: number) => `${n} ${chips.value ? (n === 1 ? 'chip' : 'chips') : n === 1 ? 'point' : 'points'}`
const phaseProps = computed(() => ({
  view: props.view,
  room: props.room,
  me: props.me,
  send: props.send,
  serverNow: props.serverNow,
  settings: props.settings,
}))
</script>
