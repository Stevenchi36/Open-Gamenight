<template>
  <div>
    <div class="d-flex align-center mb-3 text-body-medium text-medium-emphasis">
      <span>Game {{ view.game }}</span>
      <v-spacer />
      <span v-if="myScore !== null">Games won: <strong>{{ myScore }}</strong></span>
    </div>
    <PlayingPhase v-if="view.phase === 'PLAYING'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" v-bind="phaseProps" />

    <!-- Here, not in ResultsPhase: it has to be on screen before RESULTS arrives to see the win happen live. -->
    <WinCelebration
      :active="view.outcome === 'win'"
      :title="view.winnerId === me ? 'You win!' : `${nameOf(room, view.winnerId)} wins!`"
      subtitle="Out of cards"
      :standings="standings(view, me, (id) => nameOf(room, id))"
      :delay="FLIGHT_MS"
    />
  </div>
</template>

<script setup lang="ts">
import { FLIGHT_MS, nameOf, WinCelebration } from '@wsfg/core/ui'
import { computed } from 'vue'
import PlayingPhase from './phases/PlayingPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import type { PhaseProps } from './props.ts'
import { standings } from './text.ts'

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
