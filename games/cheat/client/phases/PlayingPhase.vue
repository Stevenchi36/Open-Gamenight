<template>
  <div>
    <v-alert v-if="view.you.status === 'waiting'" type="info" variant="tonal" class="mb-4">
      You joined during this game. You'll be dealt in when the next game starts.
    </v-alert>

    <StatusCard v-if="last" compact :color="lastColor" :overline="turnLine">
      {{ moveText(last, me, (id) => nameOf(room, id)) }}
      <div v-if="last.kind === 'call'" class="d-flex flex-wrap ga-2 mt-2" role="group" aria-label="Turned up">
        <PlayingCard v-for="card in last.cards" :key="card.rank + card.suit" :card="card" :class="{ 'card--false': card.rank !== last.claim }" />
      </div>
    </StatusCard>
    <StatusCard v-else compact overline="New game" :title="myTurn ? 'You go first' : `${nameOf(room, view.turn)} goes first`" />

    <CheatTable :view="view" :room="room" :me="me" />

    <v-btn v-if="canCall" block size="x-large" color="error" class="mb-4" @click="call">
      <div>
        <div class="text-title-large font-weight-bold">Cheat!</div>
        <div class="text-body-small text-none">{{ nameOf(room, view.top!.playerId) }}'s {{ claimText(view.top!.count, view.top!.claim) }}</div>
      </div>
    </v-btn>

    <template v-if="view.you.status === 'playing'">
      <div class="text-body-medium text-center text-medium-emphasis mb-3">
        <template v-if="myTurn">Your turn: play 1-{{ MAX_PLAY }} cards as <strong>{{ claimsText(view.claims) }}</strong>. They don't have to be.</template>
        <template v-else>Next claim: {{ claimsText(view.claims) }}. You can pick your cards while you wait.</template>
      </div>
      <HandCards
        :hand="view.you.hand"
        :selected="selected"
        :dealing="view.log.length === 0"
        :arrive-delay="arriveDelay(view)"
        class="mb-4"
        @toggle="toggle"
      />

      <template v-if="myTurn">
        <!-- Chips wrap: the first play with Nearby may claim any of the 13 ranks. -->
        <v-chip-group v-if="view.claims.length > 1" v-model="claim" mandatory column selected-class="text-primary" class="claim-chips mb-2">
          <v-chip v-for="rank in view.claims" :key="rank" :value="rank" filter variant="outlined">{{ rankName(rank) }}</v-chip>
        </v-chip-group>
        <v-btn block size="large" color="primary" class="mb-4" :disabled="!canPlay" @click="play">
          <template v-if="secondsLeft !== null">Calls open… {{ secondsLeft }}s</template>
          <template v-else-if="selected.length === 0">Pick 1-{{ MAX_PLAY }} cards</template>
          <template v-else-if="claim">Play {{ selected.length }} as {{ rankName(claim, selected.length) }}</template>
          <template v-else>Pick a rank to claim</template>
        </v-btn>
      </template>
      <div v-else class="text-center text-body-large text-medium-emphasis mb-4">Waiting for {{ nameOf(room, view.turn) }}…</div>
    </template>

    <MoveLogDialog v-if="view.settings.moveHistory !== 'off' && view.log.length > 1" title="Moves this game" :entries="moves" block />
  </div>
</template>

<script setup lang="ts">
import { rankName, type Card, type Rank } from '@ogn/core/kit'
import { MoveLogDialog, moveLogEntries, nameOf, PlayingCard, StatusCard, useCountdown } from '@ogn/core/ui'
import { computed, ref, watch } from 'vue'
import { MAX_PLAY } from '../../shared/index.ts'
import CheatTable from '../CheatTable.vue'
import { arriveDelay } from '../flights.ts'
import HandCards from '../HandCards.vue'
import type { PhaseProps } from '../props.ts'
import { claimsText, claimText, moveText, moveTone } from '../text.ts'

const props = defineProps<PhaseProps>()

const myTurn = computed(() => props.view.turn === props.me)
const last = computed(() => props.view.log.at(-1) ?? null)
const moves = computed(() => moveLogEntries(props.view.log, (m) => moveText(m, props.me, (id) => nameOf(props.room, id)), moveTone, { start: props.view.logStart }))
const secondsLeft = useCountdown(() => props.view.callUntil, props.serverNow)

const turnLine = computed(() => {
  if (!myTurn.value) return `${nameOf(props.room, props.view.turn)}'s turn`
  return props.view.stage === 'calling' ? "You're next" : 'Your turn'
})

// Green when a call went your way, red when you picked up the pile.
const lastColor = computed(() => {
  const m = last.value
  if (m?.kind !== 'call') return undefined
  if (m.pickerId === props.me) return 'error'
  if ((m.callerId === props.me && m.lied) || (m.playerId === props.me && !m.lied)) return 'success'
  return undefined
})

const canCall = computed(() => {
  const top = props.view.top
  return top !== null && top.playerId !== props.me && props.view.you.status === 'playing'
})

function call() {
  if (props.view.top) props.send({ type: 'call', play: props.view.top.play })
}

const selected = ref<Card[]>([])
const claim = ref<Rank | null>(null)

const same = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit

function toggle(card: Card) {
  if (selected.value.some((c) => same(c, card))) selected.value = selected.value.filter((c) => !same(c, card))
  else if (selected.value.length < MAX_PLAY) selected.value = [...selected.value, card]
}

// Drop picked cards that have left the hand; a pickup keeps the rest of the choice.
watch(
  () => props.view.you.hand,
  (hand) => (selected.value = selected.value.filter((c) => hand.some((h) => same(h, c)))),
)
watch(
  () => props.view.game,
  () => (selected.value = []),
)
// With one rank allowed it's chosen already; with Nearby the player picks.
watch(
  () => props.view.claims.join(),
  () => (claim.value = props.view.claims.length === 1 ? props.view.claims[0]! : null),
  { immediate: true },
)

const canPlay = computed(() => myTurn.value && props.view.stage === 'play' && selected.value.length > 0 && claim.value !== null)

function play() {
  if (!canPlay.value || !claim.value) return
  props.send({ type: 'play', cards: selected.value, claim: claim.value })
  selected.value = []
}
</script>

<style scoped>
.claim-chips :deep(.v-slide-group__content) {
  justify-content: center;
}
/* A turned-up card that isn't what was claimed. */
.card--false {
  outline: 3px solid rgb(var(--v-theme-error));
}
</style>
