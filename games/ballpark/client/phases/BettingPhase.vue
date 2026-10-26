<template>
  <div>
    <QuestionCard compact :question="view.question" :deadline="view.deadline" :server-now="serverNow" />

    <v-alert v-if="view.you.status === 'waiting'" type="info" variant="tonal" class="mb-4">
      You joined during this round. You'll play from the next question.
    </v-alert>
    <template v-else-if="choosing">
      <div class="text-title-large mb-1">Place your {{ TOKENS }} tokens</div>
      <div class="text-body-medium mb-3">{{ howToWin }} Tap a guess to put a token on it; both on one is fine.</div>
    </template>

    <SlotBoard
      :slots="view.slots"
      :unit="view.question.unit"
      :room="room"
      :me="me"
      :bets="othersBets"
      :draft="choosing ? draft : publicMine"
      :pickable="choosing"
      :removable="choosing"
      @pick="place"
      @remove="unplace"
    />

    <v-card v-if="choosing && settings.scoring === 'chips' && draft.length > 0" variant="tonal" class="mb-4">
      <v-card-text>
        <div class="text-body-large mb-1">Stake chips on your tokens</div>
        <div class="text-body-medium text-medium-emphasis mb-2">
          A winning token pays its odds × (1 + stake). A losing token loses its stake. You have {{ myChips }} chip{{ myChips === 1 ? '' : 's' }}.
        </div>
        <div v-for="(bet, i) in draft" :key="i" class="d-flex align-center ga-2">
          <span class="flex-grow-1">Token on {{ slotLabel(bet.slot) }}</span>
          <v-btn icon="mdi-minus" size="small" variant="text" :disabled="bet.stake === 0" aria-label="Less" @click="bet.stake--" />
          <span class="text-title-large" style="min-width: 2ch; text-align: center">{{ bet.stake }}</span>
          <v-btn icon="mdi-plus" size="small" variant="text" :disabled="staked >= myChips" aria-label="More" @click="bet.stake++" />
        </div>
      </v-card-text>
    </v-card>

    <template v-if="view.you.status === 'playing'">
      <v-btn v-if="choosing" block size="large" color="primary" class="mb-4" :disabled="draft.length < TOKENS" prepend-icon="mdi-check" @click="submit">
        {{ draft.length < TOKENS ? `Place ${TOKENS - draft.length} more token${TOKENS - draft.length === 1 ? '' : 's'}` : 'Place my bets' }}
      </v-btn>
      <template v-else>
        <!-- Hidden bets: keep them out of a neighbour's sight. -->
        <HoldToReveal v-if="settings.bets === 'hidden'" label="Hold to see your bets" class="mb-2">
          <div class="text-label-large">Your bets</div>
          <div v-for="(bet, i) in view.you.bets" :key="i" class="text-title-large">
            {{ slotLabel(bet.slot) }}<template v-if="bet.stake"> (+{{ bet.stake }})</template>
          </div>
        </HoldToReveal>
        <div class="text-center mb-4">
          <v-btn variant="text" size="small" prepend-icon="mdi-pencil" @click="startChanging">Change my bets</v-btn>
        </div>
      </template>
    </template>

    <ProgressCount :done="view.betted.length" :total="view.roundPlayers.length" label="bet" />
    <div v-if="waitingOn.length > 0 && view.betted.length > 0" class="text-body-medium text-medium-emphasis text-center mb-4">
      Waiting for {{ waitingOn.map((id) => nameOf(room, id)).join(', ') }}
    </div>

    <v-btn v-if="amHost" block variant="tonal" prepend-icon="mdi-eye" @click="send({ type: 'reveal_answer' })">Reveal the answer</v-btn>
  </div>
</template>

<script setup lang="ts">
import { HoldToReveal, isHost, nameOf, ProgressCount } from '@wsfg/core/ui'
import { computed, ref, watch } from 'vue'
import { TOKENS, type Bet } from '../../shared/index.ts'
import { formatValue } from '../format.ts'
import QuestionCard from '../QuestionCard.vue'
import SlotBoard from '../SlotBoard.vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const amHost = computed(() => isHost(props.room, props.me))
const waitingOn = computed(() => props.view.roundPlayers.filter((id) => !props.view.betted.includes(id)))
const myChips = computed(() => props.view.scores[props.me] ?? 0)

const draft = ref<Bet[]>([])
const changing = ref(false)
const choosing = computed(() => props.view.you.status === 'playing' && (props.view.you.bets.length === 0 || changing.value))
const staked = computed(() => draft.value.reduce((n, b) => n + b.stake, 0))

/** Public bets show your sent tokens on the board like everyone else's. */
const publicMine = computed(() => (props.view.bets ? props.view.you.bets : undefined))
const othersBets = computed(() => {
  if (!props.view.bets) return null
  const { [props.me]: _mine, ...others } = props.view.bets
  return others
})

const howToWin = computed(() =>
  props.settings.winRule === 'over'
    ? 'Bet on the guess closest to the answer without going over.'
    : 'Bet on the guess closest to the answer.',
)

function slotLabel(id: string): string {
  const slot = props.view.slots.find((s) => s.id === id)
  if (!slot) return '?'
  return slot.value === null ? 'All too high' : formatValue(slot.value, props.view.question.unit)
}

function place(slot: string) {
  // A third tap moves your oldest token.
  draft.value = [...draft.value.slice(draft.value.length >= TOKENS ? 1 : 0), { slot, stake: 0 }]
}

function unplace(slot: string) {
  const i = draft.value.map((b) => b.slot).lastIndexOf(slot)
  if (i >= 0) draft.value = draft.value.filter((_, j) => j !== i)
}

function submit() {
  props.send({ type: 'place_bets', bets: draft.value.map((b) => ({ slot: b.slot, stake: b.stake })) })
  changing.value = false
}

function startChanging() {
  draft.value = props.view.you.bets.map((b) => ({ ...b }))
  changing.value = true
}

// A new round of betting starts with no tokens down.
watch(
  () => `${props.view.round}|${props.view.question.text}`,
  () => {
    draft.value = []
    changing.value = false
  },
)
</script>
