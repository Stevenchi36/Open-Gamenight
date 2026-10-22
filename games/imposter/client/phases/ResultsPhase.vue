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
      <div v-if="result.guessRequired" class="text-body-2 mt-1">
        Their guess<template v-if="result.guess">, "{{ result.guess }}",</template> was {{ result.guessCorrect ? 'right' : 'wrong' }}.
      </div>
    </StatusCard>

    <ScoreBoard :scores="view.scores" :room="room" :gained="result.pointsAwarded" class="mb-4" />

    <VoteBreakdown v-if="!result.voided" :result="result" :view="view" :room="room" />

    <template v-if="amHost">
      <v-checkbox v-if="rotating" v-model="shuffle" label="Randomize player order" density="compact" hide-details />
      <v-btn block size="x-large" color="primary" prepend-icon="mdi-replay" @click="send({ type: 'next_round', shuffle })">
        Play again
      </v-btn>
    </template>
    <div v-else class="text-center text-body-1 text-medium-emphasis">
      Waiting for {{ nameOf(room, room.hostId) }} to start the next round.
    </div>
  </div>
</template>

<script setup lang="ts">
import { isHost, nameOf, ScoreBoard, StatusCard } from '@wsfg/core/ui'
import { computed, ref } from 'vue'
import type { ImposterSettings } from '../../shared/index.ts'
import type { PhaseProps } from '../props.ts'
import VoteBreakdown from '../VoteBreakdown.vue'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const amHost = computed(() => isHost(props.room, props.me))
// 'random' reshuffles every round anyway
const rotating = computed(() => (props.room.game.settings as ImposterSettings).playerOrder === 'rotate')
const shuffle = ref(false)
const won = computed(() => {
  const r = result.value
  if (!r || props.view.you.role === 'waiting') return false
  return props.me === r.imposterId ? !!r.imposterWon : !r.imposterWon
})
</script>
