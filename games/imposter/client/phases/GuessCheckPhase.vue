<template>
  <div v-if="result">
    <template v-if="me === result.imposterId">
      <StatusCard v-if="!typed" color="primary" variant="flat" prominent overline="Your last chance" title="Say your guess out loud!">
        What do you think the secret word is? {{ judgeLine }}
      </StatusCard>
      <StatusCard v-else-if="result.guess === null" color="primary" variant="flat" prominent compact overline="Your last chance" title="What's the secret word?">
        <SubmitField label="Your guess" :maxlength="GUESS_MAX_LENGTH" send-label="Send guess" on-color @submit="(word) => send({ type: 'submit_guess', word })" />
        <div class="text-body-2 mt-2">One try. {{ judgeLine }}</div>
      </StatusCard>
      <StatusCard v-else color="primary" variant="flat" prominent overline="You guessed" :title="result.guess">
        {{ judgeLine }}
      </StatusCard>
    </template>

    <template v-else-if="me === result.judgeId">
      <div class="text-h6 mb-2">You're the judge</div>
      <div class="text-body-2 mb-3">
        <template v-if="!typed">Listen to {{ nameOf(room, result.imposterId) }}'s guess, then check it against the word.</template>
        <template v-else>Check {{ nameOf(room, result.imposterId) }}'s guess against the word. Close misspellings can count.</template>
      </div>
      <template v-if="typed">
        <StatusCard v-if="result.guess !== null" overline="Their guess" :title="result.guess" />
        <StatusCard v-else>Waiting for {{ nameOf(room, result.imposterId) }} to type a guess...</StatusCard>
      </template>
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

    <StatusCard v-else-if="typed && result.guess !== null" prominent :overline="`${nameOf(room, result.imposterId)} guessed`" :title="result.guess">
      {{ judgeLine }}
    </StatusCard>
    <StatusCard v-else prominent compact :title="`${nameOf(room, result.imposterId)} is guessing the word`">
      {{ judgeLine }}
    </StatusCard>

    <v-btn v-if="amHost && me !== result.judgeId" block variant="tonal" class="mt-4" prepend-icon="mdi-skip-next" @click="send({ type: 'skip_guess' })">
      Skip the guess (counts as missed)
    </v-btn>

    <VoteBreakdown :room="room" :ballots="result.votedFor" :voters="view.roundPlayers" :marked-id="result.imposterId" marked-label="imposter" class="mt-4" />
  </div>
</template>

<script setup lang="ts">
import { HoldToReveal, isHost, nameOf, StatusCard, SubmitField, VoteBreakdown } from '@wsfg/core/ui'
import { computed } from 'vue'
import { GUESS_MAX_LENGTH } from '../../shared/index.ts'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const amHost = computed(() => isHost(props.room, props.me))
const typed = computed(() => props.settings.clueMode === 'typed')
const waitingForGuess = computed(() => typed.value && result.value?.guess === null)
const judgeLine = computed(() =>
  result.value?.judgeId ? `${nameOf(props.room, result.value.judgeId)} decides if it's right.` : 'Waiting for a judge to reconnect.',
)
</script>
