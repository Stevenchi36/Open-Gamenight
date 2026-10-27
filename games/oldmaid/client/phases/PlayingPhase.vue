<template>
  <div>
    <v-alert v-if="view.you.status === 'waiting'" type="info" variant="tonal" class="mb-4">
      You joined during this game. You'll be dealt in when the next {{ view.settings.format === 'royale' ? 'Royale' : 'round' }} starts.
    </v-alert>
    <v-alert v-else-if="view.you.status === 'eliminated'" type="info" variant="tonal" class="mb-4">
      You were the Old Maid, so you're out of this Royale. Watch who's next!
    </v-alert>

    <StatusCard v-if="last" compact :color="lastColor" :overline="myTurn ? 'Your turn' : `${nameOf(room, view.turn)}'s turn`">
      {{ moveText(last, me, (id) => nameOf(room, id)) }}
    </StatusCard>
    <StatusCard v-else compact :overline="overline" :title="myTurn ? 'You go first' : `${nameOf(room, view.turn)} goes first`" />

    <MaidTable :view="view" :room="room" :me="me" />

    <template v-if="myTurn && view.from">
      <div class="text-body-large text-center mb-1">
        Take a card from <strong>{{ nameOf(room, view.from) }}</strong>
      </div>
      <PickFan :count="fromCards" :picked="picked" @pick="(i) => (picked = picked === i ? null : i)" />
      <v-btn block size="large" color="primary" class="my-4" :disabled="picked === null" @click="take">Take it</v-btn>
    </template>

    <template v-if="view.you.status === 'playing'">
      <div class="d-flex align-center mb-2">
        <span class="text-label-large">Your hand</span>
        <v-spacer />
        <v-btn v-if="view.settings.arrange" size="small" variant="tonal" prepend-icon="mdi-shuffle-variant" @click="send({ type: 'shuffle' })">Shuffle</v-btn>
      </div>
      <div v-if="view.settings.arrange" class="text-body-small text-medium-emphasis text-center mb-2">
        {{ nameOf(room, drawnBy) }} draws from your hand in this order. Tap a card, then where it should go.
      </div>
      <HandCards
        :hand="view.you.hand"
        :arranging="view.settings.arrange"
        :dealing="view.log.length === 0"
        class="mb-4"
        @move="(order) => send({ type: 'arrange', order })"
      />
      <div v-if="!myTurn" class="text-center text-body-large text-medium-emphasis mb-4">
        Waiting for {{ nameOf(room, view.turn) }} to take a card from {{ view.from === me ? 'you' : nameOf(room, view.from) }}…
      </div>
    </template>
    <div v-else-if="view.you.status === 'out'" class="text-center text-body-large mb-4">You're out of cards, so you're safe this round!</div>

    <MoveLogDialog v-if="view.log.length > 1" title="Moves this round" :entries="moves" block />
  </div>
</template>

<script setup lang="ts">
import { MoveLogDialog, moveLogEntries, nameOf, StatusCard } from '@wsfg/core/ui'
import { computed, ref, watch } from 'vue'
import HandCards from '../HandCards.vue'
import MaidTable from '../MaidTable.vue'
import PickFan from '../PickFan.vue'
import type { PhaseProps } from '../props.ts'
import { moveText, moveTone } from '../text.ts'

const props = defineProps<PhaseProps>()

const myTurn = computed(() => props.view.turn === props.me)
const last = computed(() => props.view.log.at(-1) ?? null)
const moves = computed(() => moveLogEntries(props.view.log, (m) => moveText(m, props.me, (id) => nameOf(props.room, id)), moveTone))
const overline = computed(() => (props.view.settings.format === 'royale' ? `Royale ${props.view.game} · Round ${props.view.round}` : 'New round'))
// Green when you made a pair, red when someone took a card from you.
const lastColor = computed(() => {
  const m = last.value
  if (!m) return undefined
  if (m.drawerId === props.me && m.pair) return 'success'
  if (m.fromId === props.me) return 'error'
  return undefined
})

const fromCards = computed(() => props.view.seats.find((s) => s.id === props.view.from)?.cards ?? 0)
/** Who takes from you next: the next player round the table still holding cards. */
const drawnBy = computed(() => {
  const seats = props.view.seats
  const at = seats.findIndex((s) => s.id === props.me)
  for (let i = 1; i < seats.length; i++) {
    const s = seats[(at + i) % seats.length]!
    if (s.inRound && !s.left && s.cards > 0) return s.id
  }
  return null
})

const picked = ref<number | null>(null)
// A fresh pick after every draw.
watch(
  () => [props.view.game, props.view.round, props.view.log.length, props.view.turn],
  () => (picked.value = null),
)

function take() {
  if (picked.value !== null) props.send({ type: 'draw', index: picked.value })
}
</script>
