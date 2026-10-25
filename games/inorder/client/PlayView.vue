<template>
  <div>
    <div class="d-flex align-center ga-3 mb-3 text-body-2 text-medium-emphasis">
      <span>Round {{ view.round }}{{ view.totalRounds !== null ? ` of ${view.totalRounds}` : '' }}</span>
      <v-spacer />
      <LivesLeft :lives="view.lives" :max="view.maxLives" />
    </div>
    <OrderingPhase v-if="view.phase === 'ORDERING'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" :key="view.round" v-bind="phaseProps" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LivesLeft from './LivesLeft.vue'
import OrderingPhase from './phases/OrderingPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import type { PhaseProps } from './props.ts'

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
