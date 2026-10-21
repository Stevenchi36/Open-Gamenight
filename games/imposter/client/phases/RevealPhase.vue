<template>
  <div v-if="result">
    <v-card :color="result.caught ? 'success' : 'error'" variant="tonal" class="mb-4 text-center">
      <v-card-text class="py-6">
        <div class="text-overline">{{ headline }}</div>
        <div class="text-h4 font-weight-bold mb-1">
          {{ me === result.imposterId ? 'You were' : `${nameOf(room, result.imposterId)} was` }} the imposter
        </div>
        <div class="text-body-1">{{ detail }}</div>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-title class="text-subtitle-1">Votes</v-card-title>
      <v-card-text>
        <div v-for="row in tally" :key="row.id" class="mb-2">
          <div class="d-flex text-body-2">
            <span>{{ nameOf(room, row.id) }}</span>
            <v-spacer />
            <span>{{ row.votes }}</span>
          </div>
          <v-progress-linear
            :model-value="(row.votes / maxVotes) * 100"
            :color="row.id === result.imposterId ? 'error' : 'primary'"
            rounded
            height="8"
          />
        </div>
        <div v-if="tally.length === 0" class="text-medium-emphasis">No votes were cast.</div>
      </v-card-text>
    </v-card>
    <div class="text-center text-body-2 text-medium-emphasis">{{ next }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { nameOf, type PhaseProps } from '../util.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const tally = computed(() =>
  Object.entries(result.value?.votes ?? {})
    .map(([id, votes]) => ({ id, votes }))
    .sort((a, b) => b.votes - a.votes),
)
const maxVotes = computed(() => Math.max(1, ...tally.value.map((r) => r.votes)))
const headline = computed(() => (result.value?.caught ? 'Caught!' : 'The imposter escaped'))
const detail = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.caught) return 'The group voted them out.'
  if (!r.accusedId) return "It's a tie, so nobody was voted out."
  return `The group voted for ${nameOf(props.room, r.accusedId)}, who was innocent.`
})
const next = computed(() => (result.value?.guessRequired ? 'Next: the imposter guesses the word...' : 'Results coming up...'))
</script>
