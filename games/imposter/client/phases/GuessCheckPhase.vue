<template>
  <div v-if="result">
    <template v-if="me === result.imposterId">
      <v-card color="primary" variant="flat" class="mb-4 text-center">
        <v-card-text class="py-8">
          <template v-if="!typed">
            <div class="text-overline">Your last chance</div>
            <div class="text-h4 font-weight-bold mb-2">Say your guess out loud!</div>
            <div class="text-body-1">What do you think the secret word is? {{ judgeLine }}</div>
          </template>
          <template v-else-if="result.guess === null">
            <div class="text-overline">Your last chance</div>
            <div class="text-h5 font-weight-bold mb-3">What's the secret word?</div>
            <v-form class="d-flex ga-2" @submit.prevent="submitGuess">
              <v-text-field
                v-model="guess"
                label="Your guess"
                :maxlength="GUESS_MAX_LENGTH"
                autofocus
                autocomplete="off"
                autocapitalize="off"
                hide-details
                bg-color="surface"
              />
              <v-btn type="submit" color="surface" size="large" :disabled="!guess.trim()" icon="mdi-send" aria-label="Send guess" />
            </v-form>
            <div class="text-body-2 mt-2">One try. {{ judgeLine }}</div>
          </template>
          <template v-else>
            <div class="text-overline">You guessed</div>
            <div class="text-h4 font-weight-bold mb-2">{{ result.guess }}</div>
            <div class="text-body-1">{{ judgeLine }}</div>
          </template>
        </v-card-text>
      </v-card>
    </template>

    <template v-else-if="me === result.judgeId">
      <div class="text-h6 mb-2">You're the judge</div>
      <div class="text-body-2 mb-3">
        <template v-if="!typed">Listen to {{ nameOf(room, result.imposterId) }}'s guess, then check it against the word.</template>
        <template v-else>Check {{ nameOf(room, result.imposterId) }}'s guess against the word. Close misspellings can count.</template>
      </div>
      <v-card v-if="typed" variant="tonal" class="mb-3 text-center">
        <v-card-text>
          <template v-if="result.guess !== null">
            <div class="text-overline">Their guess</div>
            <div class="text-h4 font-weight-bold">{{ result.guess }}</div>
          </template>
          <div v-else class="text-body-1">Waiting for {{ nameOf(room, result.imposterId) }} to type a guess...</div>
        </v-card-text>
      </v-card>
      <HoldToReveal label="Hold to see the secret word" class="mb-4">
        <div class="text-overline">The secret word</div>
        <div class="text-h4 font-weight-bold">{{ result.secretWord }}</div>
      </HoldToReveal>
      <div class="d-flex ga-2">
        <v-btn class="flex-grow-1" size="x-large" color="success" prepend-icon="mdi-check" :disabled="waitingForGuess" @click="send({ type: 'judge_guess', correct: true })">
          Got it
        </v-btn>
        <v-btn class="flex-grow-1" size="x-large" color="error" prepend-icon="mdi-close" :disabled="waitingForGuess" @click="send({ type: 'judge_guess', correct: false })">
          Missed it
        </v-btn>
      </div>
    </template>

    <v-card v-else variant="tonal" class="mb-4 text-center">
      <v-card-text class="py-8">
        <template v-if="typed && result.guess !== null">
          <div class="text-overline">{{ nameOf(room, result.imposterId) }} guessed</div>
          <div class="text-h4 font-weight-bold mb-2">{{ result.guess }}</div>
        </template>
        <div v-else class="text-h5 mb-2">{{ nameOf(room, result.imposterId) }} is guessing the word</div>
        <div class="text-body-1">{{ judgeLine }}</div>
      </v-card-text>
    </v-card>

    <v-btn v-if="isHost && me !== result.judgeId" block variant="tonal" class="mt-4" prepend-icon="mdi-skip-next" @click="send({ type: 'skip_guess' })">
      Skip the guess (counts as missed)
    </v-btn>

    <VoteBreakdown :result="result" :view="view" :room="room" class="mt-4" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { GUESS_MAX_LENGTH, type ImposterSettings } from '../../shared/index.ts'
import HoldToReveal from '../HoldToReveal.vue'
import { nameOf, type PhaseProps } from '../util.ts'
import VoteBreakdown from '../VoteBreakdown.vue'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const isHost = computed(() => props.room.hostId === props.me)
const typed = computed(() => (props.room.game.settings as ImposterSettings).clueMode === 'typed')
const waitingForGuess = computed(() => typed.value && result.value?.guess === null)
const judgeLine = computed(() =>
  result.value?.judgeId ? `${nameOf(props.room, result.value.judgeId)} decides if it's right.` : 'Waiting for a judge to reconnect.',
)

const guess = ref('')
function submitGuess() {
  const word = guess.value.trim()
  if (word) props.send({ type: 'submit_guess', word })
}
</script>
