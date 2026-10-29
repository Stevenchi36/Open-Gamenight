<template>
  <SpectatorLayout>
    <template v-if="view.phase === 'BIDDING'">
      <StatusCard v-if="view.bid" prominent :overline="`Bid ${view.bids.length} · ${name(view.turn)}'s turn`">
        <template #title>
          <span class="d-inline-flex align-center ga-3">
            {{ view.bid.quantity }} ×
            <v-icon :icon="`mdi-dice-${view.bid.face}`" size="64" />
          </span>
        </template>
        {{ name(view.bid.playerId) }} bids {{ bidText(view.bid) }} among all {{ view.totalDice }} dice{{ settings.wildOnes && view.bid.face !== 1 ? ', ones are wild' : '' }}
      </StatusCard>
      <StatusCard v-else prominent overline="New round" :title="`${view.totalDice} dice in play`">{{ name(view.turn) }} opens the bidding.</StatusCard>
    </template>
    <template v-else-if="view.phase === 'REVEAL' && result">
      <StatusCard prominent :color="callWon(result) ? 'success' : 'error'" :overline="outcome.overline" :title="outcome.title">{{ outcome.text }}</StatusCard>
    </template>
    <template v-else>
      <StatusCard v-if="!view.winnerId" prominent title="Match over">Not enough players were left to finish it.</StatusCard>
      <StatusCard v-else prominent color="success" overline="Last dice standing" :title="`${name(view.winnerId)} wins the match`" />
    </template>

    <RoundResultCard v-if="view.phase !== 'BIDDING' && result" :result="result" :room="room" :wild-ones="settings.wildOnes" large :stagger="stagger" />
    <DiceSeats :seats="view.seats" :turn="view.turn" :room="room" />

    <template #side>
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-label-large">Round {{ view.round }}</div>
          <div class="text-headline-small">{{ view.totalDice }} dice in play</div>
          <div v-if="settings.wildOnes" class="text-body-large mt-1">Ones are wild</div>
        </v-card-text>
      </v-card>

      <!-- While bidding the newest bid is in the status card, so the list holds the moves before it. -->
      <BidLog
        :view="view"
        :room="room"
        :me="SPECTATOR_ID"
        :title="view.bid ? 'Earlier moves' : 'Moves this match'"
        :skip-latest="!!view.bid"
        large
      />

      <div class="text-label-large">Matches won</div>
      <ScoreBoard :scores="view.scores" :room="room" :gained="gained" />
    </template>

    <WinCelebration :active="!!view.winnerId" :title="`${name(view.winnerId)} wins!`" subtitle="Last dice standing" :delay="400" />
  </SpectatorLayout>
</template>

<script setup lang="ts">
// The watch page's Liar's Dice: every seat's dice as hidden cups (counts, never faces), the bid
// big and the bids before it; on a call, everyone's dice turning up one player after another.
// It's the view built for SPECTATOR_ID, which has no dice: faces only ever come from the call.
import type { SpectatorViewProps } from '@ogn/core/client'
import type { PlayerId } from '@ogn/core/contract'
import { SPECTATOR_ID } from '@ogn/core/protocol'
import { nameOf, ScoreBoard, SpectatorLayout, StatusCard, WinCelebration } from '@ogn/core/ui'
import { computed, ref, watch } from 'vue'
import type { LiarsDiceSettings, LiarsDiceView } from '../shared/index.ts'
import BidLog from './BidLog.vue'
import DiceSeats from './DiceSeats.vue'
import { bidText } from './props.ts'
import RoundResultCard from './RoundResultCard.vue'
import { callWon, verdict } from './text.ts'

const props = defineProps<SpectatorViewProps<LiarsDiceView, LiarsDiceSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const result = computed(() => props.view.lastRound)
const outcome = computed(() => (result.value ? verdict(result.value, SPECTATOR_ID, name) : { overline: '', title: '', text: '' }))
const gained = computed(() => (props.view.winnerId ? { [props.view.winnerId]: 1 } : {}))

// The dice turn up one player after another when the call happens live, not when the TV opens on it.
const stagger = ref(false)
watch(
  () => props.view.phase,
  (now, before) => {
    stagger.value = now === 'REVEAL' && before === 'BIDDING'
  },
)
</script>
