<template>
  <div v-if="result">
    <StatusCard
      :color="result.caught ? 'success' : 'error'"
      :overline="headline"
      :title="`${me === result.imposterId ? 'You were' : `${nameOf(room, result.imposterId)} was`} the imposter`"
    >
      {{ detail }}
    </StatusCard>

    <VoteBreakdown :room="room" :ballots="result.votedFor" :voters="view.roundPlayers" :marked-id="result.imposterId" marked-label="imposter" />
    <div class="text-center text-body-medium text-medium-emphasis">{{ next }}</div>
  </div>
</template>

<script setup lang="ts">
import { nameOf, StatusCard, VoteBreakdown } from '@wsfg/core/ui'
import { computed } from 'vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
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
