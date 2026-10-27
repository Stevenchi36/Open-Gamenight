<template>
  <div>
    <StatusCard v-if="view.outcome === 'abandoned'" compact title="Round over">Not enough players were left to finish it.</StatusCard>
    <StatusCard v-else prominent :color="view.maidId === me ? 'error' : undefined" :overline="overline" :title="maidTitle(view, me, name)">
      <div class="d-flex flex-column align-center ga-2 mt-2 text-center">
        <PlayingCard v-if="view.maidCard" :card="view.maidCard" size="lg" />
        <span>{{ maidSubtitle(view, me, name) }}</span>
      </div>
    </StatusCard>

    <v-card v-if="order.length > 0" class="mb-4" title="Out, in order">
      <v-list density="compact">
        <v-list-item v-for="(id, i) in order" :key="id" :title="id === me ? 'You' : name(id)">
          <template #prepend>
            <span class="text-medium-emphasis mr-3">{{ ordinal(i + 1) }}</span>
          </template>
        </v-list-item>
        <v-list-item v-if="view.maidId" :title="`${view.maidId === me ? 'You' : name(view.maidId)}, the Old Maid`">
          <template #prepend>
            <!-- In a span: a bare v-icon in prepend gets Vuetify's wide icon spacer, out of line with "1st". -->
            <span class="text-medium-emphasis mr-3"><v-icon icon="mdi-weather-pouring" size="small" /></span>
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <MaidTable :view="view" :room="room" :me="me" />

    <div class="text-label-large">{{ view.settings.format === 'royale' ? 'Royales won' : 'Points' }}</div>
    <ScoreBoard :scores="view.scores" :room="room" :gained="gained" class="mb-4" />

    <NextRoundButton :room="room" :me="me" :label="nextLabel" :waiting-for="`to start the ${nextLabel.toLowerCase()}`" @next="send({ type: 'next_round' })" />
  </div>
</template>

<script setup lang="ts">
import type { PlayerId } from '@ogn/core/contract'
import { nameOf, NextRoundButton, ordinal, PlayingCard, ScoreBoard, StatusCard } from '@ogn/core/ui'
import { computed } from 'vue'
import MaidTable from '../MaidTable.vue'
import type { PhaseProps } from '../props.ts'
import { maidSubtitle, maidTitle } from '../text.ts'

const props = defineProps<PhaseProps>()

const name = (id: PlayerId) => nameOf(props.room, id)
const royale = computed(() => props.view.settings.format === 'royale')
const overline = computed(() => (royale.value ? `Royale ${props.view.game} · Round ${props.view.round}` : 'Round over'))
const order = computed(() =>
  props.view.seats
    .filter((s) => s.outPlace !== null)
    .sort((a, b) => a.outPlace! - b.outPlace!)
    .map((s) => s.id),
)
const gained = computed((): Record<PlayerId, number> => {
  const v = props.view
  if (v.outcome !== 'maid') return {}
  if (royale.value) return v.royaleWinnerId ? { [v.royaleWinnerId]: 1 } : {}
  return Object.fromEntries(v.seats.filter((s) => s.inRound && !s.left && s.id !== v.maidId).map((s) => [s.id, 1]))
})
const nextLabel = computed(() => (props.view.royaleGoesOn ? 'Next round' : royale.value ? 'New Royale' : 'Next round'))
</script>
