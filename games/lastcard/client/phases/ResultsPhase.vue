<template>
  <div>
    <StatusCard v-if="view.outcome === 'abandoned'" compact title="Round over">Not enough players were left to finish it.</StatusCard>
    <StatusCard v-else prominent :color="view.winnerId === me ? 'success' : undefined" :overline="overline" :title="headline">
      <template v-if="points">
        {{ view.winnerId === me ? 'You score' : 'They score' }} {{ view.roundPoints }} {{ view.roundPoints === 1 ? 'point' : 'points' }} from the cards left.
      </template>
    </StatusCard>

    <v-card v-if="view.hands" variant="tonal" class="mb-4">
      <v-card-title class="text-subtitle-1">Cards left</v-card-title>
      <v-list density="compact" bg-color="transparent">
        <v-list-item v-for="seat in leftovers" :key="seat.id">
          <v-list-item-title class="mb-1">
            {{ seat.id === me ? 'You' : nameOf(room, seat.id) }}
            <span v-if="points" class="text-medium-emphasis">· {{ handPoints(seat.hand) }} pts</span>
          </v-list-item-title>
          <div class="d-flex flex-wrap ga-1">
            <LcCard v-for="(card, i) in seat.hand" :key="i" :card="card" size="sm" />
          </div>
        </v-list-item>
      </v-list>
    </v-card>

    <ScoreBoard v-if="points" :scores="seatPoints" :room="room" :gained="gained" class="mb-4" />
    <ScoreBoard v-else :scores="view.scores" :room="room" :gained="gained" class="mb-4" />

    <NextRoundButton
      :room="room"
      :me="me"
      :label="points && view.champion ? 'New game' : 'Next round'"
      :waiting-for="points && view.champion ? 'to start a new game' : 'to deal the next round'"
      @next="send({ type: 'next_round' })"
    />
  </div>
</template>

<script setup lang="ts">
import { nameOf, NextRoundButton, ScoreBoard, StatusCard } from '@wsfg/core/ui'
import { computed } from 'vue'
import { handPoints } from '../../shared/index.ts'
import LcCard from '../LcCard.vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()

const points = computed(() => props.view.settings.scoring === 'points')
const winner = computed(() => (props.view.winnerId === props.me ? 'You' : nameOf(props.room, props.view.winnerId)))
const wins = computed(() => (props.view.winnerId === props.me ? 'win' : 'wins'))

const overline = computed(() => {
  if (points.value && props.view.champion) return `Reached ${props.view.settings.target} points`
  return 'Out of cards'
})
const headline = computed(() => {
  if (points.value && props.view.champion) return `${winner.value} ${wins.value} the game!`
  return `${winner.value} ${wins.value} the round`
})

/** Everyone else's hand, in seat order, for checking the count. */
const leftovers = computed(() =>
  props.view.seats.filter((s) => s.id !== props.view.winnerId && props.view.hands?.[s.id]).map((s) => ({ id: s.id, hand: props.view.hands![s.id]! })),
)
// The points table shows this game's points; leavers are gone from it.
const seatPoints = computed(() => Object.fromEntries(props.view.seats.filter((s) => !s.left).map((s) => [s.id, s.points])))
const gained = computed(() => {
  const id = props.view.winnerId
  if (!id) return {}
  return { [id]: points.value ? props.view.roundPoints : 1 }
})
</script>
