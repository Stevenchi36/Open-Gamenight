<template>
  <v-row>
    <v-col cols="12" md="8">
      <div :key="view.phase" :class="{ 'phase-in': live }">
        <template v-if="view.phase === 'CLUES'">
          <StatusCard prominent :overline="clueOverline" :title="typed ? `${current} is thinking of a clue` : `${current} is speaking`">
            <div v-if="view.turn.currentPlayerId && !isConnected(room, view.turn.currentPlayerId)">Away. Skipping soon if they don't come back.</div>
            <CountdownTimer :deadline="view.turn.deadline" :server-now="serverNow" />
          </StatusCard>
          <v-progress-linear :model-value="progress" color="primary" rounded height="8" class="mb-4" />
          <TurnOrder :room="room" :order="view.turn.order" :current="view.turn.currentPlayerId" :me="SPECTATOR_ID" large class="mb-4" />
        </template>

        <template v-else-if="view.phase === 'VOTING'">
          <StatusCard prominent color="primary" :overline="category ? `Category: ${category}` : `Round ${view.round}`" title="Who is the imposter?">
            Everyone votes on their phone. You can change your vote until everyone has voted.
          </StatusCard>
          <WhoAnswered :room="room" :players="view.roundPlayers" :done="view.voted" label="voted" large />
        </template>

        <template v-else-if="result && view.phase === 'REVEAL'">
          <StatusCard prominent :color="result.caught ? 'success' : 'error'" :overline="result.caught ? 'Caught!' : 'The imposter escaped'" :title="`${name(result.imposterId)} was the imposter`">
            {{ revealDetail }}
          </StatusCard>
        </template>

        <template v-else-if="result && view.phase === 'GUESS_CHECK'">
          <StatusCard v-if="typed && result.guess !== null" prominent :overline="`${name(result.imposterId)} guessed`" :title="result.guess">{{ judgeLine }}</StatusCard>
          <StatusCard v-else prominent overline="Last chance" :title="`${name(result.imposterId)} is guessing the word`">{{ judgeLine }}</StatusCard>
        </template>

        <template v-else-if="result">
          <StatusCard v-if="result.voided" prominent title="Round cancelled">The imposter left, so nobody scores this round.</StatusCard>
          <StatusCard v-else prominent :color="result.imposterWon ? 'error' : 'success'" :overline="result.imposterWon ? 'The imposter wins' : 'The crew wins'">
            <template #title>The word was {{ result.secretWord }}</template>
            {{ name(result.imposterId) }} was the imposter{{ result.caught ? ' and got caught' : ' and escaped' }}.
            <div v-if="result.guessRequired" class="mt-1">
              Their guess<template v-if="result.guess">, "{{ result.guess }}",</template> was {{ result.guessCorrect ? 'right' : 'wrong' }}.
            </div>
          </StatusCard>
        </template>
      </div>

      <VoteBreakdown
        v-if="result && !result.voided"
        :room="room"
        :ballots="result.votedFor"
        :voters="view.roundPlayers"
        :marked-id="result.imposterId"
        marked-label="imposter"
        class="tv-votes"
      />
      <ClueList v-if="typed" :view="view" :room="room" large />
      <div v-else-if="view.phase === 'CLUES'" class="text-h6 text-medium-emphasis text-center">Clues are said out loud this round.</div>
    </v-col>

    <v-col cols="12" md="4">
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-overline">Round {{ view.round }}</div>
          <div class="text-h5">{{ category ?? 'Secret category' }}</div>
          <div class="text-body-1 mt-1">
            {{ view.phase === 'CLUES' ? `Rotation ${view.turn.rotation} of ${view.turn.totalRotations}` : `${view.roundPlayers.length} players` }}
          </div>
        </v-card-text>
      </v-card>
      <ScoreBoard :scores="view.scores" :room="room" :gained="result?.pointsAwarded" />
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
// The watch page's Word Imposter. Before the reveal it shows only what every player knows: the
// category (when even the imposter gets it), the clues in order, whose turn it is and who has
// voted, never for whom. Then the imposter, the votes, the guess and the word. It's the view built
// for SPECTATOR_ID: outside the round, so no word, no role and no ballot.
import type { SpectatorViewProps } from '@wsfg/core/client'
import type { PlayerId } from '@wsfg/core/contract'
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { CountdownTimer, isConnected, nameOf, ScoreBoard, StatusCard, TurnOrder, VoteBreakdown, WhoAnswered } from '@wsfg/core/ui'
import { computed, ref, watch } from 'vue'
import type { ImposterSettings, ImposterView } from '../shared/index.ts'
import ClueList from './ClueList.vue'

const props = defineProps<SpectatorViewProps<ImposterView, ImposterSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const result = computed(() => props.view.result)
const typed = computed(() => props.settings.clueMode === 'typed')
const category = computed(() => props.view.you.category)
const current = computed(() => name(props.view.turn.currentPlayerId))
const clueOverline = computed(() => `${category.value ? `Category: ${category.value} · ` : ''}Round ${props.view.round}`)

const progress = computed(() => {
  const { order, currentPlayerId, rotation, totalRotations } = props.view.turn
  if (order.length === 0) return 0
  const done = (rotation - 1) * order.length + Math.max(0, order.indexOf(currentPlayerId ?? ''))
  return (done / (order.length * totalRotations)) * 100
})

const revealDetail = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.caught) return 'The group voted them out.'
  if (!r.accusedId) return "It's a tie, so nobody was voted out."
  return `The group voted for ${name(r.accusedId)}, who was innocent.`
})
const judgeLine = computed(() => (result.value?.judgeId ? `${name(result.value.judgeId)} decides if it's right.` : 'Waiting for a judge to reconnect.'))

// Each phase's card pops in when the phase changes while watching, not when the TV opens on it.
const live = ref(false)
watch(
  () => props.view.phase,
  () => {
    live.value = true
  },
)
</script>

<style scoped>
.phase-in {
  animation: phase-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes phase-in {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .phase-in {
    animation: none;
  }
}
.tv-votes :deep(.text-body-2) {
  font-size: 1.125rem !important;
}
</style>
