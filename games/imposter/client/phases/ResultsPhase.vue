<template>
  <div v-if="result">
    <v-card v-if="result.voided" variant="tonal" class="mb-4 text-center">
      <v-card-text class="py-6">
        <div class="text-h5 mb-1">Round cancelled</div>
        <div class="text-body-1">The imposter left, so nobody scores this round.</div>
      </v-card-text>
    </v-card>
    <v-card v-else :color="won ? 'success' : 'error'" variant="tonal" class="mb-4 text-center">
      <v-card-text class="py-6">
        <div class="text-overline">{{ result.imposterWon ? 'The imposter wins' : 'The crew wins' }}</div>
        <div class="text-h4 font-weight-bold mb-2">{{ won ? 'You won!' : 'You lost' }}</div>
        <div class="text-body-1">
          The word was <strong>{{ result.secretWord }}</strong>.
          {{ nameOf(room, result.imposterId) }} was the imposter{{ result.caught ? ' and got caught' : ' and escaped' }}.
        </div>
        <div v-if="result.guessRequired" class="text-body-2 mt-1">
          Their guess<template v-if="result.guess">, "{{ result.guess }}",</template> was {{ result.guessCorrect ? 'right' : 'wrong' }}.
        </div>
      </v-card-text>
    </v-card>

    <ScoreBoard :scores="view.scores" :room="room" :gained="result.pointsAwarded" class="mb-4" />

    <VoteBreakdown v-if="!result.voided" :result="result" :view="view" :room="room" />

    <template v-if="isHost">
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
import { computed, ref } from 'vue'
import type { ImposterSettings } from '../../shared/index.ts'
import ScoreBoard from '../ScoreBoard.vue'
import { nameOf, type PhaseProps } from '../util.ts'
import VoteBreakdown from '../VoteBreakdown.vue'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const isHost = computed(() => props.room.hostId === props.me)
// 'random' reshuffles every round anyway
const rotating = computed(() => (props.room.game.settings as ImposterSettings).playerOrder === 'rotate')
const shuffle = ref(false)
const won = computed(() => {
  const r = result.value
  if (!r || props.view.you.role === 'waiting') return false
  return props.me === r.imposterId ? !!r.imposterWon : !r.imposterWon
})
</script>
