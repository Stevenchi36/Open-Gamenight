<template>
  <div>
    <v-alert v-if="view.you.status === 'waiting'" type="info" variant="tonal" class="mb-4">
      You joined during this round. You'll be dealt in when the next round starts.
    </v-alert>

    <StatusCard v-if="last" compact :color="lastColor" :overline="turnLine">
      {{ moveText(last, me, (id) => nameOf(room, id), view.settings.sevenZero) }}
    </StatusCard>
    <StatusCard v-else compact overline="New round" :title="myTurn ? 'You go first' : `${nameOf(room, view.turn)} goes first`">
      <template v-if="view.pendingDraw > 0">{{ myTurn ? 'You face' : 'They face' }} a +{{ view.pendingDraw }}.</template>
    </StatusCard>

    <LastTable :view="view" :room="room" :me="me" :tappable="swapTargets" :selected="swapWith" @select="(id) => (swapWith = id)" />

    <template v-if="view.you.status === 'playing'">
      <v-btn
        v-if="view.exposed && view.exposed !== me"
        block
        size="large"
        color="error"
        class="mb-3"
        prepend-icon="mdi-hand-back-right"
        @click="send({ type: 'catch', targetId: view.exposed })"
      >
        Catch {{ nameOf(room, view.exposed) }}! No Last card! call
      </v-btn>

      <div v-if="hint" class="text-body-2 text-center text-medium-emphasis mb-2">{{ hint }}</div>
      <HandCards
        :hand="view.you.hand"
        :playable="playable"
        :selected="selected"
        :dim-unplayable="myTurn"
        :dealing="view.log.length === 0"
        :arrive-delay="arriveDelay(view)"
        class="mb-4"
        @select="(i) => (selected = i)"
      />

      <div v-if="selectedCard && isWild(selectedCard)" class="d-flex ga-2 mb-3">
        <v-btn
          v-for="c in COLORS"
          :key="c"
          class="flex-grow-1 color-btn"
          size="large"
          :style="{ background: CARD_COLORS[c] }"
          :aria-label="`Play the ${cardName(selectedCard)} as ${c}`"
          @click="play(c)"
        >
          {{ c }}
        </v-btn>
      </div>
      <v-btn v-else-if="selectedCard" block size="large" color="primary" class="mb-3" :disabled="needsSwap && !swapWith" @click="play()">
        {{ playLabel }}
      </v-btn>

      <div class="d-flex ga-2 mb-4">
        <v-btn v-if="myTurn && view.stage === 'play'" class="flex-grow-1" size="large" variant="tonal" prepend-icon="mdi-cards-outline" @click="send({ type: 'draw' })">
          {{ view.pendingDraw > 0 ? `Draw ${view.pendingDraw}` : 'Draw' }}
        </v-btn>
        <v-btn v-if="myTurn && view.stage === 'drawn'" class="flex-grow-1" size="large" variant="tonal" @click="send({ type: 'pass' })">Keep it</v-btn>
        <v-btn
          v-if="view.settings.lastCall === 'call'"
          class="flex-grow-1"
          size="large"
          color="warning"
          :variant="calling || view.exposed === me ? 'flat' : 'outlined'"
          :prepend-icon="calling ? 'mdi-check' : 'mdi-bullhorn'"
          :aria-pressed="view.exposed === me ? undefined : calling"
          @click="callLastCard"
        >
          Last card!
        </v-btn>
      </div>
      <div v-if="!myTurn" class="text-center text-body-1 text-medium-emphasis mb-4">Waiting for {{ nameOf(room, view.turn) }}…</div>
    </template>

    <v-expansion-panels v-if="view.log.length > 1" variant="accordion">
      <v-expansion-panel title="Moves this round">
        <v-expansion-panel-text>
          <div v-for="(m, i) in [...view.log].reverse()" :key="view.log.length - i" class="text-body-2 mb-1">
            {{ moveText(m, me, (id) => nameOf(room, id), view.settings.sevenZero) }}
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup lang="ts">
import type { PlayerId } from '@wsfg/core/contract'
import { nameOf, StatusCard } from '@wsfg/core/ui'
import { computed, ref, watch } from 'vue'
import { canJumpIn, canPlay, COLORS, isWild, sameCard, type Color } from '../../shared/index.ts'
import { arriveDelay } from '../flights.ts'
import HandCards from '../HandCards.vue'
import LastTable from '../LastTable.vue'
import type { PhaseProps } from '../props.ts'
import { CARD_COLORS, cardName, moveText } from '../text.ts'

const props = defineProps<PhaseProps>()

const myTurn = computed(() => props.view.turn === props.me)
const last = computed(() => props.view.log.at(-1) ?? null)
const table = computed(() => ({ top: props.view.top, color: props.view.color, pendingDraw: props.view.pendingDraw }))

const turnLine = computed(() => {
  const facing = props.view.pendingDraw > 0 ? ` (facing +${props.view.pendingDraw})` : ''
  return myTurn.value ? `Your turn${facing}` : `${nameOf(props.room, props.view.turn)}'s turn${facing}`
})
// Red when the latest move cost you cards.
const lastColor = computed(() => {
  const m = last.value
  if (!m) return undefined
  if ((m.kind === 'catch' && m.targetId === props.me) || (m.kind === 'draw' && m.penalty && m.playerId === props.me)) return 'error'
  return undefined
})

/** Per card in hand: can it be picked now (your turn, or a jump-in). */
const playable = computed(() => {
  const { hand, drawn } = props.view.you
  const drawnAt = drawn ? hand.findIndex((c) => sameCard(c, drawn)) : -1
  return hand.map((card, i) => {
    if (myTurn.value) return (props.view.stage === 'play' || i === drawnAt) && canPlay(card, hand, table.value)
    return props.view.settings.jumpIn && canJumpIn(card, table.value)
  })
})

const selected = ref<number | null>(null)
const swapWith = ref<PlayerId | null>(null)
const calling = ref(false)

const selectedCard = computed(() => (selected.value === null ? null : (props.view.you.hand[selected.value] ?? null)))
const needsSwap = computed(() => props.view.settings.sevenZero && selectedCard.value?.value === '7' && props.view.you.hand.length > 1)
const swapTargets = computed(() => (needsSwap.value ? props.view.seats.filter((s) => s.id !== props.me && !s.left).map((s) => s.id) : []))

const hint = computed(() => {
  if (needsSwap.value && !swapWith.value) return 'Tap a player to swap hands with.'
  if (selectedCard.value && isWild(selectedCard.value)) return 'Pick the colour to play next.'
  if (myTurn.value && props.view.stage === 'drawn') {
    const drawn = props.view.you.drawn
    return drawn && playable.value.some(Boolean) ? `You drew a ${cardName(drawn)}. Play it or keep it.` : `You drew a ${drawn ? cardName(drawn) : 'card'}. It can't be played.`
  }
  if (myTurn.value) return playable.value.some(Boolean) ? 'Tap a card to play, or draw.' : 'Nothing fits: draw a card.'
  return playable.value.some(Boolean) ? 'You hold the same card as the top one: jump in!' : ''
})

const playLabel = computed(() => {
  const card = selectedCard.value
  if (!card) return ''
  if (!myTurn.value) return `Jump in with the ${cardName(card)}!`
  if (needsSwap.value && swapWith.value) return `Play the ${cardName(card)}, swap with ${nameOf(props.room, swapWith.value)}`
  return `Play the ${cardName(card)}`
})

// A fresh choice after every move; a playable drawn card is picked already.
watch(
  () => [props.view.round, props.view.log.length, props.view.turn, props.view.stage],
  () => {
    swapWith.value = null
    const { hand, drawn } = props.view.you
    const drawnAt = drawn ? hand.findIndex((c) => sameCard(c, drawn)) : -1
    selected.value = myTurn.value && props.view.stage === 'drawn' && playable.value[drawnAt] ? drawnAt : null
  },
  { immediate: true },
)
// Last card! is pressed for the next play only.
watch(
  () => props.view.you.hand.length,
  () => (calling.value = false),
)

function play(color?: Color) {
  const card = selectedCard.value
  if (!card) return
  props.send({ type: 'play', card, color, swapWith: needsSwap.value ? (swapWith.value ?? undefined) : undefined, lastCard: calling.value })
}

function callLastCard() {
  if (props.view.exposed === props.me) props.send({ type: 'call' })
  else calling.value = !calling.value
}
</script>

<style scoped>
.color-btn {
  color: #fff;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
}
</style>
