<template>
  <div v-if="result">
    <StatusCard v-if="result.voided" compact title="Round cancelled">The imposter left, so nobody scores this round.</StatusCard>
    <StatusCard
      v-else
      :color="won ? 'success' : 'error'"
      :overline="result.imposterWon ? 'The imposter wins' : 'The crew wins'"
      :title="won ? 'You won!' : 'You lost'"
    >
      The word was <strong>{{ result.secretWord }}</strong>.
      {{ nameOf(room, result.imposterId) }} was the imposter{{ result.caught ? ' and got caught' : ' and escaped' }}.
      <div v-if="result.guessRequired" class="text-body-medium mt-1">
        Their guess<template v-if="result.guess">, "{{ result.guess }}",</template> was {{ result.guessCorrect ? 'right' : 'wrong' }}.
      </div>
    </StatusCard>

    <ScoreBoard :scores="view.scores" :room="room" :gained="result.pointsAwarded" class="mb-4" />

    <VoteBreakdown v-if="!result.voided" :room="room" :ballots="result.votedFor" :voters="view.roundPlayers" :marked-id="result.imposterId" marked-label="imposter" />

    <NextRoundButton :room="room" :me="me" @next="send({ type: 'next_round', shuffle })">
      <template #options>
        <v-checkbox v-if="rotating" v-model="shuffle" label="Randomize player order" density="compact" hide-details />
      </template>
    </NextRoundButton>
  </div>
</template>

<script setup lang="ts">
import { nameOf, NextRoundButton, ScoreBoard, StatusCard, VoteBreakdown } from '@ogn/core/ui'
import { computed, ref } from 'vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
// 'random' reshuffles every round anyway
const rotating = computed(() => props.settings.playerOrder === 'rotate')
const shuffle = ref(false)
const won = computed(() => {
  const r = result.value
  if (!r || props.view.you.role === 'waiting') return false
  return props.me === r.imposterId ? !!r.imposterWon : !r.imposterWon
})
</script>
