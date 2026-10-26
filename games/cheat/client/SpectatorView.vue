<template>
  <SpectatorLayout>
    <template v-if="view.phase === 'PLAYING'">
      <StatusCard v-if="last" prominent :color="moveTone(last) ?? undefined" :overline="`Move ${view.logStart + view.log.length} · ${turnLine}`">
        {{ moveText(last, SPECTATOR_ID, name) }}
        <div v-if="last.kind === 'call'" class="d-flex flex-wrap ga-2 mt-3" :aria-label="`Turned up: ${last.cards.map((c) => c.rank).join(', ')}`">
          <PlayingCard v-for="card in last.cards" :key="card.rank + card.suit" :card="card" :class="{ 'card--false': card.rank !== last.claim }" />
        </div>
      </StatusCard>
      <StatusCard v-else prominent overline="New game" :title="`${name(view.turn)} goes first`" />

      <v-alert v-if="secondsLeft !== null && view.top" color="error" variant="tonal" class="mb-4 text-headline-small" icon="mdi-bullhorn">
        {{ name(view.top.playerId) }}'s {{ claimText(view.top.count, view.top.claim) }}: anyone can call Cheat! {{ secondsLeft }}s
      </v-alert>
    </template>
    <template v-else>
      <StatusCard v-if="view.outcome === 'abandoned'" prominent title="Game over">Not enough players were left to finish it.</StatusCard>
      <StatusCard v-else prominent color="success" overline="Out of cards" :title="`${name(view.winnerId)} wins`">
        {{ last ? moveText(last, SPECTATOR_ID, name) : '' }}
      </StatusCard>
    </template>

    <CheatTable :view="view" :room="room" :me="SPECTATOR_ID" layout="table" />

    <template #side>
      <v-card v-if="view.phase === 'PLAYING'" class="mb-4">
        <v-card-text>
          <div class="text-label-large">Game {{ view.game }} · next claim</div>
          <div class="text-headline-small">{{ claimsText(view.claims) }}</div>
        </v-card-text>
      </v-card>

      <v-card v-if="earlier.length > 0" class="mb-4" title="Earlier moves">
        <v-card-text>
          <MoveLog :entries="earlier" large />
        </v-card-text>
      </v-card>

      <div class="text-label-large">Games won</div>
      <ScoreBoard :scores="view.scores" :room="room" :gained="gained" />
    </template>

    <WinCelebration
      :active="view.outcome === 'win'"
      :title="`${name(view.winnerId)} wins!`"
      subtitle="Out of cards"
      :standings="standings(view, SPECTATOR_ID, name)"
      :delay="FLIGHT_MS"
    />
  </SpectatorLayout>
</template>

<script setup lang="ts">
// The watch page's Cheat: the table, the latest move and the call countdown, sized for a TV.
// It's the view built for SPECTATOR_ID, so there's no hand; moveText never says "you".
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import type { SpectatorViewProps } from '@wsfg/core/client'
import type { PlayerId } from '@wsfg/core/contract'
import { FLIGHT_MS, MoveLog, moveLogEntries, nameOf, PlayingCard, ScoreBoard, SpectatorLayout, StatusCard, useCountdown, WinCelebration } from '@wsfg/core/ui'
import { computed } from 'vue'
import type { CheatSettings, CheatView } from '../shared/index.ts'
import CheatTable from './CheatTable.vue'
import { claimsText, claimText, moveText, moveTone, standings } from './text.ts'

const props = defineProps<SpectatorViewProps<CheatView, CheatSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const last = computed(() => props.view.log.at(-1) ?? null)
// The latest is in the status card; the rest newest first, a screenful at most.
const earlier = computed(() =>
  moveLogEntries(props.view.log, (m) => moveText(m, SPECTATOR_ID, name), moveTone, { skipLatest: true, max: 8, start: props.view.logStart }),
)
const secondsLeft = useCountdown(() => props.view.callUntil, props.serverNow)
const turnLine = computed(() => (props.view.stage === 'calling' ? `${name(props.view.turn)} is next` : `${name(props.view.turn)}'s turn`))
const gained = computed(() => (props.view.phase === 'RESULTS' && props.view.winnerId ? { [props.view.winnerId]: 1 } : {}))
</script>

<style scoped>
/* A turned-up card that isn't what was claimed. */
.card--false {
  outline: 3px solid rgb(var(--v-theme-error));
}
</style>
