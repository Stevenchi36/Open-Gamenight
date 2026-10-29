<template>
  <div>
    <div class="d-flex align-center mb-3 text-body-medium text-medium-emphasis">
      <span v-if="points">Game {{ view.game }} · first to {{ view.settings.target }}</span>
      <span v-else>Round {{ view.round }}</span>
      <v-spacer />
      <span v-if="myScore !== null">{{ points ? 'Games won' : 'Rounds won' }}: <strong>{{ myScore }}</strong></span>
    </div>
    <PlayingPhase v-if="view.phase === 'PLAYING'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" v-bind="phaseProps" />

    <!-- Here, not in ResultsPhase: it has to be on screen before RESULTS arrives to see the win happen live. -->
    <WinCelebration
      :active="gameWon(view)"
      :title="resultTitle(view, me, (id) => nameOf(room, id))"
      :subtitle="points ? `Reached ${view.settings.target} points` : 'Out of cards'"
      :delay="300"
    />
  </div>
</template>

<script setup lang="ts">
import { nameOf, useAnnounce, WinCelebration } from '@ogn/core/ui'
import { computed } from 'vue'
import PlayingPhase from './phases/PlayingPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import type { PhaseProps } from './props.ts'
import { gameWon, moveText, resultTitle } from './text.ts'

const props = defineProps<PhaseProps>()

// Each new move is read out; the log starts again every round.
useAnnounce(
  () => props.view,
  (now, before) =>
    now.game === before.game && now.round === before.round && now.log.length > before.log.length
      ? moveText(now.log.at(-1)!, props.me, (id) => nameOf(props.room, id), now.settings.sevenZero)
      : null,
)

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
