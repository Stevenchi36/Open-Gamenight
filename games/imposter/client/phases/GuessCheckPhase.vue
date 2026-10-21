<template>
  <div v-if="result">
    <template v-if="me === result.imposterId">
      <v-card color="primary" variant="flat" class="mb-4 text-center">
        <v-card-text class="py-8">
          <div class="text-overline">Your last chance</div>
          <div class="text-h4 font-weight-bold mb-2">Say your guess out loud!</div>
          <div class="text-body-1">What do you think the secret word is? {{ judgeLine }}</div>
        </v-card-text>
      </v-card>
    </template>

    <template v-else-if="me === result.judgeId">
      <div class="text-h6 mb-2">You're the judge</div>
      <div class="text-body-2 mb-3">
        Listen to {{ nameOf(room, result.imposterId) }}'s guess, then check it against the word.
      </div>
      <HoldToReveal label="Hold to see the secret word" class="mb-4">
        <div class="text-overline">The secret word</div>
        <div class="text-h4 font-weight-bold">{{ result.secretWord }}</div>
      </HoldToReveal>
      <div class="d-flex ga-2">
        <v-btn class="flex-grow-1" size="x-large" color="success" prepend-icon="mdi-check" @click="send({ type: 'judge_guess', correct: true })">
          Got it
        </v-btn>
        <v-btn class="flex-grow-1" size="x-large" color="error" prepend-icon="mdi-close" @click="send({ type: 'judge_guess', correct: false })">
          Missed it
        </v-btn>
      </div>
    </template>

    <v-card v-else variant="tonal" class="mb-4 text-center">
      <v-card-text class="py-8">
        <div class="text-h5 mb-2">{{ nameOf(room, result.imposterId) }} is guessing the word</div>
        <div class="text-body-1">{{ judgeLine }}</div>
      </v-card-text>
    </v-card>

    <v-btn v-if="isHost && me !== result.judgeId" block variant="tonal" class="mt-4" prepend-icon="mdi-skip-next" @click="send({ type: 'skip_guess' })">
      Skip the guess (counts as missed)
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import HoldToReveal from '../HoldToReveal.vue'
import { nameOf, type PhaseProps } from '../util.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const isHost = computed(() => props.room.hostId === props.me)
const judgeLine = computed(() =>
  result.value?.judgeId ? `${nameOf(props.room, result.value.judgeId)} decides if it's right.` : 'Waiting for a judge to reconnect.',
)
</script>
