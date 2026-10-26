<template>
  <div v-if="result">
    <StatusCard prominent :color="outcomeColor" :overline="result.call === 'liar' ? 'Liar!' : 'Spot on?'" :title="headline" />
    <RoundResultCard :result="result" :room="room" :wild-ones="settings.wildOnes" />
    <BidLog :view="view" :room="room" :me="me" />
    <SeatList :seats="view.seats" :turn="null" :me="me" :room="room" />
  </div>
</template>

<script setup lang="ts">
import { nameOf, StatusCard } from '@wsfg/core/ui'
import { computed } from 'vue'
import BidLog from '../BidLog.vue'
import RoundResultCard from '../RoundResultCard.vue'
import SeatList from '../SeatList.vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.lastRound)
const headline = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.gainerId) return r.gainerId === props.me ? 'You get a die back' : `${nameOf(props.room, r.gainerId)} gets a die back`
  return r.loserId === props.me ? 'You lose a die' : `${nameOf(props.room, r.loserId)} loses a die`
})
const outcomeColor = computed(() => {
  const r = result.value
  if (r?.gainerId === props.me) return 'success'
  return r?.loserId === props.me ? 'error' : undefined
})
</script>
