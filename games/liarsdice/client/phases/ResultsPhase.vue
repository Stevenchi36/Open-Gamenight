<template>
  <div>
    <StatusCard v-if="!view.winnerId" compact title="Match over">Not enough players were left to finish it.</StatusCard>
    <StatusCard
      v-else
      prominent
      :color="view.winnerId === me ? 'success' : undefined"
      overline="Last dice standing"
      :title="view.winnerId === me ? 'You win the match!' : `${nameOf(room, view.winnerId)} wins the match`"
    />

    <RoundResultCard v-if="view.lastRound" :result="view.lastRound" :room="room" :wild-ones="settings.wildOnes" />
    <BidLog :view="view" :room="room" :me="me" dialog />

    <ScoreBoard :scores="view.scores" :room="room" :gained="gained" class="mb-4" />

    <NextRoundButton :room="room" :me="me" label="New match" waiting-for="to start a new match" @next="send({ type: 'new_match' })" />
  </div>
</template>

<script setup lang="ts">
import { nameOf, NextRoundButton, ScoreBoard, StatusCard } from '@ogn/core/ui'
import { computed } from 'vue'
import BidLog from '../BidLog.vue'
import RoundResultCard from '../RoundResultCard.vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const gained = computed(() => (props.view.winnerId ? { [props.view.winnerId]: 1 } : {}))
</script>
