<template>
  <div>
    <div class="d-flex align-center mb-3 text-body-medium text-medium-emphasis">
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
import { nameOf, useAnnounce, WinCelebration } from '@ogn/core/ui'
import { computed } from 'vue'
import BiddingPhase from './phases/BiddingPhase.vue'
import ResultsPhase from './phases/ResultsPhase.vue'
import RevealPhase from './phases/RevealPhase.vue'
import type { PhaseProps } from './props.ts'
import { moveRows } from './text.ts'

const props = defineProps<PhaseProps>()

// Each new bid, and the call that ends a round ("Al called liar: there were 3, so Bo told the truth."), is read out.
useAnnounce(
  () => props.view,
  (now, before) => {
    const called = before.phase === 'BIDDING' && now.phase === 'REVEAL'
    if (now.round !== before.round || !(called || (now.phase === 'BIDDING' && now.bids.length > before.bids.length))) return null
    return moveRows(now, props.me, (id) => nameOf(props.room, id)).at(-1)?.text ?? null
  },
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
