<template>
  <v-row>
    <v-col cols="12" md="8">
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
        <StatusCard prominent :color="result.loserId ? 'error' : 'success'" :overline="result.call === 'liar' ? 'Liar!' : 'Spot on?'" :title="revealTitle" />
      </template>
      <template v-else>
        <StatusCard v-if="!view.winnerId" prominent title="Match over">Not enough players were left to finish it.</StatusCard>
        <StatusCard v-else prominent color="success" overline="Last dice standing" :title="`${name(view.winnerId)} wins the match`" />
      </template>

      <RoundResultCard v-if="view.phase !== 'BIDDING' && result" :result="result" :room="room" :wild-ones="settings.wildOnes" large :stagger="stagger" />
      <DiceSeats :seats="view.seats" :turn="view.turn" :room="room" />
    </v-col>

    <v-col cols="12" md="4">
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-label-large">Round {{ view.round }}</div>
          <div class="text-headline-small">{{ view.totalDice }} dice in play</div>
          <div v-if="settings.wildOnes" class="text-body-large mt-1">Ones are wild</div>
        </v-card-text>
      </v-card>

      <!-- While bidding the newest bid is in the status card; once called, the whole round with the call. -->
      <BidLog
        :view="view"
        :room="room"
        :me="SPECTATOR_ID"
        :title="view.phase === 'BIDDING' ? 'Earlier bids' : view.phase === 'RESULTS' ? 'The last round\'s bids' : 'This round\'s bids'"
        :skip-latest="view.phase === 'BIDDING'"
        large
      />

      <div class="text-label-large">Matches won</div>
      <ScoreBoard :scores="view.scores" :room="room" :gained="gained" />
    </v-col>

    <WinCelebration :active="!!view.winnerId" :title="`${name(view.winnerId)} wins!`" subtitle="Last dice standing" :delay="400" />
  </v-row>
</template>

<script setup lang="ts">
// The watch page's Liar's Dice: every seat's dice as hidden cups (counts, never faces), the bid
// big and the bids before it; on a call, everyone's dice turning up one player after another.
// It's the view built for SPECTATOR_ID, which has no dice: faces only ever come from the call.
import type { SpectatorViewProps } from '@wsfg/core/client'
import type { PlayerId } from '@wsfg/core/contract'
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { nameOf, ScoreBoard, StatusCard, WinCelebration } from '@wsfg/core/ui'
import { computed, ref, watch } from 'vue'
import type { LiarsDiceSettings, LiarsDiceView } from '../shared/index.ts'
import BidLog from './BidLog.vue'
import DiceSeats from './DiceSeats.vue'
import { bidText } from './props.ts'
import RoundResultCard from './RoundResultCard.vue'

const props = defineProps<SpectatorViewProps<LiarsDiceView, LiarsDiceSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const result = computed(() => props.view.lastRound)
const revealTitle = computed(() => {
  const r = result.value
  if (!r) return ''
  return r.gainerId ? `${name(r.gainerId)} gets a die back` : `${name(r.loserId)} loses a die`
})
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
