<template>
  <div>
    <QuestionCard :question="view.question" :deadline="view.deadline" :server-now="serverNow" />

    <v-alert v-if="view.you.status === 'waiting'" type="info" variant="tonal" class="mb-4">
      You joined during this round. You'll answer from the next question.
    </v-alert>
    <v-card v-else-if="view.you.answer === null || changing" color="primary" variant="tonal" class="mb-4">
      <v-card-text>
        <div class="text-title-large mb-1">What will most people say?</div>
        <div class="text-body-medium mb-3">Match the most popular answer to score.</div>
        <SubmitField v-model="answer" label="Your answer" :maxlength="ANSWER_MAX_LENGTH" send-label="Send" @submit="submit" />
      </v-card-text>
    </v-card>
    <template v-else>
      <!-- Phones lie on the table: keep the answer out of a neighbour's sight. -->
      <HoldToReveal label="Hold to see your answer" class="mb-2">
        <div class="text-label-large">Your answer</div>
        <div class="text-headline-small font-weight-bold">{{ view.you.answer }}</div>
      </HoldToReveal>
      <div class="text-center mb-4">
        <v-btn variant="text" size="small" prepend-icon="mdi-pencil" @click="changing = true">Change my answer</v-btn>
      </div>
    </template>

    <ProgressCount :done="view.answered.length" :total="view.roundPlayers.length" label="answered" />
    <div v-if="waitingOn.length > 0 && view.answered.length > 0" class="text-body-medium text-medium-emphasis text-center mb-4">
      Waiting for {{ waitingOn.map((id) => nameOf(room, id)).join(', ') }}
    </div>

    <v-btn v-if="amHost" block variant="tonal" prepend-icon="mdi-eye" @click="send({ type: 'reveal_answers' })">
      Reveal now
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { HoldToReveal, isHost, nameOf, ProgressCount, SubmitField } from '@ogn/core/ui'
import { computed, ref, watch } from 'vue'
import { ANSWER_MAX_LENGTH } from '../../shared/index.ts'
import QuestionCard from '../QuestionCard.vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const amHost = computed(() => isHost(props.room, props.me))
const waitingOn = computed(() => props.view.roundPlayers.filter((id) => !props.view.answered.includes(id)))

const answer = ref('')
const changing = ref(false)

function submit(text: string) {
  props.send({ type: 'submit_answer', text })
  answer.value = ''
  changing.value = false
}

// A new question starts with an empty field.
watch(
  () => props.view.round,
  () => {
    answer.value = ''
    changing.value = false
  },
)
</script>
