<template>
  <div>
    <QuestionCard :question="view.question" :deadline="view.deadline" :server-now="serverNow" />

    <v-alert v-if="view.you.status === 'waiting'" type="info" variant="tonal" class="mb-4">
      You joined during this round. You'll play from the next question.
    </v-alert>
    <v-card v-else-if="view.you.guess === null || changing" color="primary" variant="tonal" class="mb-4">
      <v-card-text>
        <div class="text-h6 mb-1">What's your best guess?</div>
        <div class="text-body-2 mb-3">No idea? Guess anyway: you can still win by betting well.</div>
        <v-form class="d-flex ga-2" @submit.prevent="submit">
          <v-text-field
            v-model="text"
            label="Your guess"
            inputmode="decimal"
            autocomplete="off"
            autofocus
            bg-color="surface"
            :suffix="view.question.unit ?? undefined"
            :error-messages="text.trim() && value === null ? 'Enter a number' : undefined"
            hide-details="auto"
          >
            <!-- Phone number pads often have no minus key. -->
            <template #prepend-inner>
              <v-btn icon="mdi-plus-minus-variant" size="small" variant="text" aria-label="Make negative or positive" @click="flipSign" />
            </template>
          </v-text-field>
          <v-btn type="submit" color="surface" size="large" :disabled="value === null" icon="mdi-send" aria-label="Send" />
        </v-form>
      </v-card-text>
    </v-card>
    <template v-else>
      <!-- Phones lie on the table: keep the guess out of a neighbour's sight. -->
      <HoldToReveal label="Hold to see your guess" class="mb-2">
        <div class="text-overline">Your guess</div>
        <div class="text-h5 font-weight-bold">{{ formatValue(view.you.guess, view.question.unit) }}</div>
      </HoldToReveal>
      <div class="text-center mb-4">
        <v-btn variant="text" size="small" prepend-icon="mdi-pencil" @click="changing = true">Change my guess</v-btn>
      </div>
    </template>

    <ProgressCount :done="view.guessed.length" :total="view.roundPlayers.length" label="guessed" />
    <div v-if="waitingOn.length > 0 && view.guessed.length > 0" class="text-body-2 text-medium-emphasis text-center mb-4">
      Waiting for {{ waitingOn.map((id) => nameOf(room, id)).join(', ') }}
    </div>

    <v-btn v-if="amHost" block variant="tonal" prepend-icon="mdi-eye" @click="send({ type: 'reveal_guesses' })">
      Reveal guesses
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { HoldToReveal, isHost, nameOf, ProgressCount } from '@wsfg/core/ui'
import { computed, ref, watch } from 'vue'
import { formatValue, parseGuess } from '../format.ts'
import QuestionCard from '../QuestionCard.vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const amHost = computed(() => isHost(props.room, props.me))
const waitingOn = computed(() => props.view.roundPlayers.filter((id) => !props.view.guessed.includes(id)))

const text = ref('')
const changing = ref(false)
const value = computed(() => parseGuess(text.value))

function flipSign() {
  const t = text.value.trim()
  text.value = t.startsWith('-') || t.startsWith('−') ? t.slice(1) : `-${t}`
}

function submit() {
  if (value.value === null) return
  props.send({ type: 'submit_guess', value: value.value })
  text.value = ''
  changing.value = false
}

// A new question starts with an empty field.
watch(
  () => `${props.view.round}|${props.view.question.text}`,
  () => {
    text.value = ''
    changing.value = false
  },
)
</script>
