<template>
  <v-row>
    <v-col cols="12" md="8">
      <template v-if="view.phase === 'PLAYING'">
        <StatusCard v-if="last" prominent :color="moveTone(last) ?? undefined" :overline="`Move ${view.log.length} · ${turnLine}`">{{ moveText(last, SPECTATOR_ID, name, view.settings.sevenZero) }}</StatusCard>
        <StatusCard v-else prominent overline="New round" :title="`${name(view.turn)} goes first`">
          <template v-if="view.pendingDraw > 0">They face a +{{ view.pendingDraw }}.</template>
        </StatusCard>
        <v-alert v-if="view.exposed" color="error" variant="tonal" class="mb-4 text-h5" icon="mdi-hand-back-right">
          {{ name(view.exposed) }} is on one card and didn't call it: anyone can catch them!
        </v-alert>
      </template>
      <template v-else>
        <StatusCard v-if="view.outcome === 'abandoned'" prominent title="Round over">Not enough players were left to finish it.</StatusCard>
        <StatusCard v-else prominent color="success" :overline="points && view.champion ? `Reached ${view.settings.target} points` : 'Out of cards'" :title="resultTitle(view, SPECTATOR_ID, name)">
          <template v-if="points">They score {{ view.roundPoints }} {{ view.roundPoints === 1 ? 'point' : 'points' }} from the cards left.</template>
        </StatusCard>
      </template>

      <LastTable :view="view" :room="room" :me="SPECTATOR_ID" layout="table" />

      <v-card v-if="leftovers.length > 0" class="mb-4" title="Cards left">
        <v-card-text>
          <div v-for="seat in leftovers" :key="seat.id" class="mb-3">
            <div class="text-body-1 mb-1">
              {{ name(seat.id) }}
              <span v-if="points" class="text-medium-emphasis">· {{ handPoints(seat.hand) }} pts</span>
            </div>
            <div class="d-flex flex-wrap ga-1">
              <LcCard v-for="(card, i) in seat.hand" :key="i" :card="card" />
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" md="4">
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-overline">{{ points ? `Game ${view.game} · first to ${view.settings.target}` : `Round ${view.round}` }}</div>
          <div class="d-flex align-center ga-2 text-h5">
            <span class="color-dot" :style="{ background: CARD_COLORS[view.color] }" />
            <span class="text-capitalize">{{ view.color }}</span>
            <v-icon class="ml-auto">{{ view.direction === 1 ? 'mdi-rotate-right' : 'mdi-rotate-left' }}</v-icon>
          </div>
          <div class="text-body-1 mt-1">
            {{ view.drawPile }} to draw<template v-if="view.pendingDraw > 0"> · <strong>+{{ view.pendingDraw }} waiting</strong></template>
          </div>
        </v-card-text>
      </v-card>

      <v-card v-if="earlier.length > 0" class="mb-4" title="Earlier moves">
        <v-card-text>
          <MoveLog :entries="earlier" large />
        </v-card-text>
      </v-card>

      <template v-if="points">
        <div class="text-overline">Points this game</div>
        <ScoreBoard :scores="seatPoints" :room="room" :gained="roundGained" class="mb-4" />
      </template>
      <div class="text-overline">{{ points ? 'Games won' : 'Rounds won' }}</div>
      <ScoreBoard :scores="view.scores" :room="room" :gained="winGained" />
    </v-col>

    <WinCelebration :active="gameWon(view)" :title="resultTitle(view, SPECTATOR_ID, name)" :subtitle="points ? `Reached ${view.settings.target} points` : 'Out of cards'" :delay="300" />
  </v-row>
</template>

<script setup lang="ts">
// The watch page's Last Card: the table (draw pile, top card, colour, direction), the latest move
// and any uncalled last card, sized for a TV. It's the view built for SPECTATOR_ID: no hand.
import type { SpectatorViewProps } from '@wsfg/core/client'
import type { PlayerId } from '@wsfg/core/contract'
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { MoveLog, moveLogEntries, nameOf, ScoreBoard, StatusCard, WinCelebration } from '@wsfg/core/ui'
import { computed } from 'vue'
import { handPoints, type LastCardSettings, type LastCardView } from '../shared/index.ts'
import LastTable from './LastTable.vue'
import LcCard from './LcCard.vue'
import { CARD_COLORS, gameWon, moveText, moveTone, resultTitle } from './text.ts'

const props = defineProps<SpectatorViewProps<LastCardView, LastCardSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const points = computed(() => props.view.settings.scoring === 'points')
const last = computed(() => props.view.log.at(-1) ?? null)
// The latest is in the status card; the rest newest first, a screenful at most.
const earlier = computed(() =>
  moveLogEntries(props.view.log, (m) => moveText(m, SPECTATOR_ID, name, props.view.settings.sevenZero), moveTone, { skipLatest: true, max: 8 }),
)
const turnLine = computed(() => `${name(props.view.turn)}'s turn${props.view.pendingDraw > 0 ? ` (facing +${props.view.pendingDraw})` : ''}`)

/** RESULTS: everyone else's hand, turned up. */
const leftovers = computed(() =>
  props.view.seats.filter((s) => s.id !== props.view.winnerId && props.view.hands?.[s.id]).map((s) => ({ id: s.id, hand: props.view.hands![s.id]! })),
)
// The points table shows this game's points; leavers are gone from it.
const seatPoints = computed(() => Object.fromEntries(props.view.seats.filter((s) => !s.left).map((s) => [s.id, s.points])))
const roundGained = computed(() => (props.view.winnerId ? { [props.view.winnerId]: props.view.roundPoints } : {}))
const winGained = computed(() => {
  const id = props.view.winnerId
  return id && (!points.value || props.view.champion) ? { [id]: 1 } : {}
})
</script>

<style scoped>
.color-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  outline: 1px solid rgba(var(--v-theme-on-surface), 0.3);
}
</style>
