<template>
  <v-row>
    <v-col cols="12" md="8">
      <template v-if="view.phase === 'GUESSING'">
        <QuestionCard :question="view.question" :deadline="view.deadline" :server-now="serverNow" />
        <WhoAnswered :room="room" :players="view.roundPlayers" :done="view.guessed" label="guessed" large />
      </template>
      <template v-else-if="view.phase === 'BETTING'">
        <QuestionCard compact :question="view.question" :deadline="view.deadline" :server-now="serverNow" />
        <div class="text-h6 text-center mb-3">{{ howToWin }}</div>
        <SlotBoard :slots="view.slots" :unit="view.question.unit" :room="room" :me="SPECTATOR_ID" :bets="view.bets" :stagger="stagger" class="tv-slots" />
        <WhoAnswered :room="room" :players="view.roundPlayers" :done="view.betted" label="bet" large />
      </template>
      <template v-else-if="result">
        <StatusCard v-if="gameOver" prominent color="success" overline="Game over" :title="winnerTitle">
          Highest {{ settings.scoring === 'chips' ? 'chips' : 'score' }} after {{ view.totalRounds }} question{{ view.totalRounds === 1 ? '' : 's' }}.
        </StatusCard>
        <StatusCard prominent color="primary" :overline="view.question.text" :title="formatValue(result.answer, view.question.unit)">
          <div v-if="result.fact" class="mb-1">{{ result.fact }}</div>
          <div class="text-h6">{{ headline }}</div>
        </StatusCard>
        <SlotBoard
          v-if="view.slots.length"
          :slots="view.slots"
          :unit="view.question.unit"
          :room="room"
          :me="SPECTATOR_ID"
          :bets="view.bets"
          :winning-ids="result.winningSlotIds"
          class="tv-slots"
        />
        <div v-else class="text-h6 text-medium-emphasis text-center mb-4">Nobody guessed.</div>
      </template>
    </v-col>

    <v-col cols="12" md="4">
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-overline">Question {{ view.round }}{{ view.totalRounds !== null ? ` of ${view.totalRounds}` : '' }}</div>
          <div class="text-h5">{{ settings.winRule === 'over' ? 'Closest without going over' : 'Closest wins' }}</div>
          <div v-if="view.phase === 'BETTING' && !view.bets" class="text-body-1 mt-1">Bets stay hidden until the answer.</div>
        </v-card-text>
      </v-card>
      <div v-if="settings.scoring === 'chips'" class="text-overline">Chips</div>
      <ScoreBoard :scores="view.scores" :room="room" :gained="result?.pointsAwarded" />
    </v-col>

    <WinCelebration
      :active="gameOver"
      :title="winnerTitle"
      :subtitle="settings.scoring === 'chips' ? 'Most chips' : 'Highest score'"
      :standings="scoreStandings(view.scores, result?.winnerIds ?? [], name, unitOf)"
      :delay="600"
    />
  </v-row>
</template>

<script setup lang="ts">
// The watch page's Ballpark: the question big with who has guessed (never what), then the board
// of guesses dropping in for betting, with tokens shown only when bets are public, then the answer
// with the winning slot lit and everyone's tokens. It's the view built for SPECTATOR_ID.
import type { SpectatorViewProps } from '@wsfg/core/client'
import type { PlayerId } from '@wsfg/core/contract'
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { nameOf, ScoreBoard, scoreStandings, StatusCard, WhoAnswered, winTitle, WinCelebration } from '@wsfg/core/ui'
import { computed, ref, watch } from 'vue'
import { TOO_HIGH, type BallparkSettings, type BallparkView } from '../shared/index.ts'
import { formatValue } from './format.ts'
import QuestionCard from './QuestionCard.vue'
import SlotBoard from './SlotBoard.vue'

const props = defineProps<SpectatorViewProps<BallparkView, BallparkSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const result = computed(() => props.view.result)
const gameOver = computed(() => (result.value?.winnerIds.length ?? 0) > 0)
const winnerTitle = computed(() => winTitle(result.value?.winnerIds ?? [], SPECTATOR_ID, name))
const unitOf = (n: number) => (props.settings.scoring === 'chips' ? `${n} ${n === 1 ? 'chip' : 'chips'}` : `${n} ${n === 1 ? 'point' : 'points'}`)

const howToWin = computed(() =>
  props.settings.winRule === 'over' ? 'Bet on the guess closest to the answer without going over.' : 'Bet on the guess closest to the answer.',
)

const headline = computed(() => {
  const winning = props.view.slots.filter((s) => result.value?.winningSlotIds.includes(s.id))
  if (winning.length === 0) return ''
  if (winning[0]!.id === TOO_HIGH) return 'Every guess was too high!'
  const names = winning.flatMap((s) => s.playerIds).map(name)
  return `${props.settings.winRule === 'over' ? 'Closest without going over' : 'Closest'}: ${names.join(' and ')}.`
})

// The board's guesses drop in when they're revealed live, not when the TV opens on them.
const stagger = ref(false)
watch(
  () => props.view.phase,
  (now, before) => {
    stagger.value = now === 'BETTING' && before === 'GUESSING'
  },
)
</script>

<style scoped>
.tv-slots :deep(.text-subtitle-1) {
  font-size: 1.375rem !important;
}
.tv-slots :deep(.text-body-2) {
  font-size: 1rem !important;
}
</style>
