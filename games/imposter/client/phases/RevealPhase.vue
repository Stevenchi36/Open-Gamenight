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
import { nameOf, StatusCard, VoteBreakdown } from '@ogn/core/ui'
import { computed } from 'vue'
import { revealDetail, revealHeadline } from '../announce.ts'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const headline = computed(() => (result.value ? revealHeadline(result.value) : ''))
const detail = computed(() => (result.value ? revealDetail(result.value, (id) => nameOf(props.room, id)) : ''))
const next = computed(() => (result.value?.guessRequired ? 'Next: the imposter guesses the word...' : 'Results coming up...'))
</script>
