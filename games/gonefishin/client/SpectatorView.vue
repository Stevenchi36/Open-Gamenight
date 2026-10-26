<template>
  <v-row>
    <v-col cols="12" md="8">
      <template v-if="view.phase === 'PLAYING'">
        <StatusCard v-if="last" prominent :color="moveTone(last) ?? undefined" :overline="`Move ${view.log.length} · ${name(view.turn)}'s turn`">{{ moveText(last, SPECTATOR_ID, name) }}</StatusCard>
        <StatusCard v-else prominent overline="New game" :title="`${name(view.turn)} goes first`" />
      </template>
      <template v-else>
        <StatusCard v-if="view.outcome === 'abandoned'" prominent title="Game over">Not enough players were left to finish it.</StatusCard>
        <StatusCard v-else prominent color="success" overline="All 13 books are down" :title="resultTitle(view, SPECTATOR_ID, name)">
          {{ topBooks }} {{ topBooks === 1 ? 'book' : 'books' }}{{ view.winnerIds.length > 1 ? ' each' : '' }}
        </StatusCard>
      </template>

      <FishTable :view="view" :room="room" :me="SPECTATOR_ID" layout="table" />
    </v-col>

    <v-col cols="12" md="4">
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-overline">Game {{ view.game }}</div>
          <div class="text-h5">{{ view.pond }} {{ view.pond === 1 ? 'card' : 'cards' }} in the pond</div>
          <div class="text-body-1 mt-1">{{ booksDown }} of 13 books down</div>
        </v-card-text>
      </v-card>

      <v-card v-if="earlier.length > 0" class="mb-4" title="Earlier moves">
        <v-card-text>
          <MoveLog :entries="earlier" large />
        </v-card-text>
      </v-card>

      <div class="text-overline">Games won</div>
      <ScoreBoard :scores="view.scores" :room="room" :gained="gained" />
    </v-col>

    <WinCelebration
      :active="view.outcome === 'win'"
      :title="resultTitle(view, SPECTATOR_ID, name)"
      subtitle="All 13 books are down"
      :standings="standings(view, SPECTATOR_ID, name)"
      :delay="300"
    />
  </v-row>
</template>

<script setup lang="ts">
// The watch page's Gone Fishin': the table with every seat's cards and books, the latest ask,
// the pond and the moves so far, sized for a TV. It's the view built for SPECTATOR_ID: no hand.
import type { SpectatorViewProps } from '@wsfg/core/client'
import type { PlayerId } from '@wsfg/core/contract'
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { MoveLog, moveLogEntries, nameOf, ScoreBoard, StatusCard, WinCelebration } from '@wsfg/core/ui'
import { computed } from 'vue'
import type { GoneFishinSettings, GoneFishinView } from '../shared/index.ts'
import FishTable from './FishTable.vue'
import { moveText, moveTone, resultTitle, standings } from './text.ts'

const props = defineProps<SpectatorViewProps<GoneFishinView, GoneFishinSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const last = computed(() => props.view.log.at(-1) ?? null)
// The latest is in the status card; the rest newest first, a screenful at most.
const earlier = computed(() =>
  moveLogEntries(props.view.log, (m) => moveText(m, SPECTATOR_ID, name), moveTone, { skipLatest: true, max: 8 }),
)
const booksDown = computed(() => props.view.seats.reduce((n, s) => n + s.books.length, 0))
const topBooks = computed(() => props.view.seats.find((s) => s.id === props.view.winnerIds[0])?.books.length ?? 0)
const gained = computed(() => Object.fromEntries(props.view.winnerIds.map((id) => [id, 1])))
</script>
