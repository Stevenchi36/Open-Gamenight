<template>
  <div>
    <div class="d-flex align-center ga-3 mb-3 text-body-medium text-medium-emphasis">
      <span>Round {{ view.round }}{{ view.totalRounds !== null ? ` of ${view.totalRounds}` : '' }}</span>
      <v-spacer />
      <LivesLeft :lives="view.lives" :max="view.maxLives" />
    </div>
    <OrderingPhase v-if="view.phase === 'ORDERING'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" :key="view.round" v-bind="phaseProps" />

    <!-- Here, not in ResultsPhase: it has to be on screen before RESULTS arrives to see the win happen live.
         It waits for the cards to turn over. -->
    <WinCelebration
      :active="view.result?.outcome === 'won'"
      title="You made it!"
      :subtitle="view.result ? roundDetail(view.result, view) : undefined"
      :delay="view.line.length * TURN_MS + 300"
    />
  </div>
</template>

<script setup lang="ts">
import { WinCelebration } from '@ogn/core/ui'
import { computed } from 'vue'
import LivesLeft from './LivesLeft.vue'
import OrderingPhase from './phases/OrderingPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import type { PhaseProps } from './props.ts'
import { roundDetail, TURN_MS } from './reveal.ts'

const props = defineProps<PhaseProps>()

const phaseProps = computed(() => ({
  view: props.view,
  room: props.room,
  me: props.me,
  send: props.send,
  serverNow: props.serverNow,
  settings: props.settings,
}))
</script>
