<template>
  <SpectatorLayout>
    <template v-if="view.phase === 'PLAYING'">
      <StatusCard v-if="last" prominent :color="moveTone(last) ?? undefined" :overline="`${name(view.turn)}'s turn`">{{ moveText(last, SPECTATOR_ID, name) }}</StatusCard>
      <StatusCard v-else prominent :overline="roundLabel" :title="`${name(view.turn)} goes first`" />
    </template>
    <template v-else>
      <StatusCard v-if="view.outcome === 'abandoned'" prominent title="Round over">Not enough players were left to finish it.</StatusCard>
      <StatusCard v-else prominent :overline="roundLabel" :title="maidTitle(view, SPECTATOR_ID, name)">
        <div class="d-flex flex-column align-center ga-2 mt-2 text-center">
          <PlayingCard v-if="view.maidCard" :card="view.maidCard" size="lg" />
          <span>{{ maidSubtitle(view, SPECTATOR_ID, name) }}</span>
        </div>
      </StatusCard>
    </template>

    <MaidTable :view="view" :room="room" :me="SPECTATOR_ID" layout="table" />

    <template #side>
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-label-large">{{ roundLabel }}</div>
          <div class="text-headline-small">{{ view.discard.length }} {{ view.discard.length === 1 ? 'pair' : 'pairs' }} down</div>
          <div v-if="view.settings.format === 'royale'" class="text-body-large mt-1">{{ stillIn }} still in the Royale</div>
        </v-card-text>
      </v-card>

      <v-card v-if="earlier.length > 0" class="mb-4" title="Earlier draws">
        <v-card-text>
          <MoveLog :entries="earlier" large />
        </v-card-text>
      </v-card>

      <div class="text-label-large">{{ view.settings.format === 'royale' ? 'Royales won' : 'Points' }}</div>
      <ScoreBoard :scores="view.scores" :room="room" />
    </template>

    <LoseReveal
      :active="view.outcome === 'maid' && !view.royaleWinnerId"
      :title="maidTitle(view, SPECTATOR_ID, name)"
      :subtitle="maidSubtitle(view, SPECTATOR_ID, name)"
      :delay="FLIGHT_MS * 2"
    >
      <PlayingCard v-if="view.maidCard" :card="view.maidCard" size="lg" />
    </LoseReveal>
    <WinCelebration
      :active="view.outcome === 'maid' && !!view.royaleWinnerId"
      :title="royaleWinTitle(view, SPECTATOR_ID, name)"
      :subtitle="royaleWinSubtitle(view, SPECTATOR_ID, name)"
      :delay="FLIGHT_MS * 2"
    />
  </SpectatorLayout>
</template>

<script setup lang="ts">
// The watch page's Old Maid: the table with every seat's face-down cards, the latest draw, the
// pairs down and the scores, sized for a TV. It's the view built for SPECTATOR_ID: no hand, and
// no card taken unless it made a pair.
import type { SpectatorViewProps } from '@ogn/core/client'
import type { PlayerId } from '@ogn/core/contract'
import { SPECTATOR_ID } from '@ogn/core/protocol'
import { FLIGHT_MS, LoseReveal, MoveLog, moveLogEntries, nameOf, PlayingCard, ScoreBoard, SpectatorLayout, StatusCard, WinCelebration } from '@ogn/core/ui'
import { computed } from 'vue'
import type { OldMaidSettings, OldMaidView } from '../shared/index.ts'
import MaidTable from './MaidTable.vue'
import { maidSubtitle, maidTitle, moveText, moveTone, royaleWinSubtitle, royaleWinTitle } from './text.ts'

const props = defineProps<SpectatorViewProps<OldMaidView, OldMaidSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const last = computed(() => props.view.log.at(-1) ?? null)
// The latest is in the status card; the rest newest first, a screenful at most.
const earlier = computed(() => moveLogEntries(props.view.log, (m) => moveText(m, SPECTATOR_ID, name), moveTone, { skipLatest: true, max: 8 }))
const roundLabel = computed(() => (props.view.settings.format === 'royale' ? `Royale ${props.view.game} · Round ${props.view.round}` : `Round ${props.view.game}`))
const stillIn = computed(() => props.view.seats.filter((s) => s.inRound && !s.left && !s.eliminated).length)
</script>
