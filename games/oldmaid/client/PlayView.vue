<template>
  <div>
    <div class="d-flex align-center mb-3 text-body-medium text-medium-emphasis">
      <span>{{ view.settings.format === 'royale' ? `Royale ${view.game} · Round ${view.round}` : `Round ${view.game}` }}</span>
      <v-spacer />
      <span v-if="myScore !== null">{{ view.settings.format === 'royale' ? 'Royales won' : 'Points' }}: <strong>{{ myScore }}</strong></span>
    </div>
    <PlayingPhase v-if="view.phase === 'PLAYING'" v-bind="phaseProps" />
    <ResultsPhase v-else-if="view.phase === 'RESULTS'" v-bind="phaseProps" />

    <!-- Here, not in ResultsPhase: it has to be on screen before RESULTS arrives to see the catch happen live. -->
    <LoseReveal :active="view.outcome === 'maid' && !view.royaleWinnerId" :title="maidTitle(view, me, name)" :subtitle="maidSubtitle(view, me, name)" :delay="FLIGHT_MS * 2">
      <PlayingCard v-if="view.maidCard" :card="view.maidCard" size="lg" />
    </LoseReveal>
    <!-- The round that decides a Royale is the one round with a winner. -->
    <WinCelebration
      :active="view.outcome === 'maid' && !!view.royaleWinnerId"
      :title="royaleWinTitle(view, me, name)"
      :subtitle="royaleWinSubtitle(view, me, name)"
      :standings="royaleStandings(view, me, name)"
      :delay="FLIGHT_MS * 2"
    />
  </div>
</template>

<script setup lang="ts">
import type { PlayerId } from '@ogn/core/contract'
import { FLIGHT_MS, LoseReveal, nameOf, PlayingCard, useAnnounce, WinCelebration } from '@ogn/core/ui'
import { computed } from 'vue'
import PlayingPhase from './phases/PlayingPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import type { PhaseProps } from './props.ts'
import { maidSubtitle, maidTitle, moveText, royaleStandings, royaleWinSubtitle, royaleWinTitle } from './text.ts'

const props = defineProps<PhaseProps>()

const name = (id: PlayerId) => nameOf(props.room, id)

// Each new move is read out; the log starts again every round.
useAnnounce(
  () => props.view,
  (now, before) => (now.game === before.game && now.round === before.round && now.log.length > before.log.length ? moveText(now.log.at(-1)!, props.me, name) : null),
)

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
