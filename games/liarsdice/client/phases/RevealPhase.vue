<template>
  <div v-if="result">
    <StatusCard prominent :color="outcomeColor" :overline="outcome.overline" :title="outcome.title">{{ outcome.text }}</StatusCard>
    <RoundResultCard :result="result" :room="room" :wild-ones="settings.wildOnes" />
    <BidLog :view="view" :room="room" :me="me" dialog />
    <SeatList :seats="view.seats" :turn="null" :me="me" :room="room" />
  </div>
</template>

<script setup lang="ts">
import { nameOf, StatusCard } from '@ogn/core/ui'
import { computed } from 'vue'
import BidLog from '../BidLog.vue'
import RoundResultCard from '../RoundResultCard.vue'
import SeatList from '../SeatList.vue'
import type { PhaseProps } from '../props.ts'
import { verdict } from '../text.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.lastRound)
const outcome = computed(() => (result.value ? verdict(result.value, props.me, (id) => nameOf(props.room, id)) : { overline: '', title: '', text: '' }))
const outcomeColor = computed(() => {
  const r = result.value
  if (r?.gainerId === props.me) return 'success'
  return r?.loserId === props.me ? 'error' : undefined
})
</script>
