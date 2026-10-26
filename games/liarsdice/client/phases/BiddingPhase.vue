<template>
  <div>
    <v-alert v-if="view.you.status === 'waiting'" type="info" variant="tonal" class="mb-4">
      You joined during this match. You'll get dice when the next match starts.
    </v-alert>
    <v-alert v-else-if="view.you.status === 'out'" type="info" variant="tonal" class="mb-4">
      You're out of dice. Watch the rest of the match.
    </v-alert>
    <HoldToReveal v-else label="Hold to see your dice" class="mb-4">
      <div class="text-label-large">Your dice</div>
      <DiceRow :dice="view.you.dice" :size="48" class="justify-center" />
    </HoldToReveal>

    <SeatList :seats="view.seats" :turn="view.turn" :me="me" :room="room" />

    <StatusCard v-if="view.bid" compact :overline="`${nameOf(room, view.bid.playerId)} bids`" :title="bidText(view.bid)">
      among all {{ view.totalDice }} dice{{ settings.wildOnes && view.bid.face !== 1 ? ', ones are wild' : '' }}
    </StatusCard>
    <StatusCard v-else compact overline="New round" :title="`${view.totalDice} dice in play`">
      {{ myTurn ? 'You open the bidding.' : `${nameOf(room, view.turn)} opens the bidding.` }}
    </StatusCard>

    <v-card v-if="myTurn" class="mb-4">
      <v-card-text>
        <div class="text-body-medium mb-2">Your bid: at least</div>
        <div class="d-flex align-center justify-center ga-4 mb-3">
          <v-btn icon="mdi-minus" variant="tonal" size="small" :disabled="quantity <= minForFace" @click="quantity--" />
          <span class="text-headline-large font-weight-bold" style="min-width: 2ch; text-align: center">{{ quantity }}</span>
          <v-btn icon="mdi-plus" variant="tonal" size="small" :disabled="quantity >= view.totalDice" @click="quantity++" />
        </div>
        <div class="d-flex justify-center flex-wrap ga-1 mb-4">
          <v-btn
            v-for="f in faces"
            :key="f.face"
            :icon="`mdi-dice-${f.face}`"
            size="large"
            :variant="face === f.face ? 'flat' : 'text'"
            :color="face === f.face ? 'primary' : undefined"
            :disabled="!f.allowed"
            :aria-label="`Face ${f.face}`"
            @click="pickFace(f.face)"
          />
        </div>
        <v-btn block size="large" color="primary" class="mb-2" :disabled="!canBid" @click="send({ type: 'bid', quantity, face })">
          Bid {{ bidText({ quantity, face }) }}
        </v-btn>
        <div v-if="callable" class="d-flex ga-2">
          <v-btn class="flex-grow-1" size="large" color="error" variant="flat" @click="send({ type: 'call' })">Liar!</v-btn>
          <v-btn v-if="settings.spotOn" class="flex-grow-1" size="large" variant="tonal" @click="send({ type: 'spot_on' })">
            Spot on
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
    <div v-else-if="view.turn" class="text-center text-body-large text-medium-emphasis mb-4">
      Waiting for {{ nameOf(room, view.turn) }}…
    </div>

    <v-expansion-panels v-if="view.bids.length > 1 || view.lastRound" variant="accordion">
      <v-expansion-panel v-if="view.bids.length > 1" title="Bids this round">
        <v-expansion-panel-text>
          <MoveLog :entries="bidEntries" />
        </v-expansion-panel-text>
      </v-expansion-panel>
      <v-expansion-panel v-if="view.lastRound" title="Last round">
        <v-expansion-panel-text>
          <RoundResultCard :result="view.lastRound" :room="room" :wild-ones="settings.wildOnes" />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup lang="ts">
import { HoldToReveal, MoveLog, moveLogEntries, nameOf, StatusCard } from '@wsfg/core/ui'
import { computed, ref, watch } from 'vue'
import { FACES, isLegalBid, minQuantity } from '../../shared/index.ts'
import DiceRow from '../DiceRow.vue'
import RoundResultCard from '../RoundResultCard.vue'
import SeatList from '../SeatList.vue'
import { bidText, type PhaseProps } from '../props.ts'
import { bidRows } from '../text.ts'

const props = defineProps<PhaseProps>()
const bidEntries = computed(() =>
  moveLogEntries(
    bidRows(props.view, props.me, (id) => nameOf(props.room, id)),
    (r) => r.text,
    (r) => r.tone,
  ),
)
const myTurn = computed(() => props.view.turn === props.me)
const callable = computed(() => props.view.bid !== null && props.view.bid.playerId !== props.me)

const faces = computed(() =>
  Array.from({ length: FACES }, (_, i) => {
    const min = minQuantity(props.view.bid, i + 1, props.settings.wildOnes)
    return { face: i + 1, min, allowed: min !== null && min <= props.view.totalDice }
  }),
)

const face = ref(2)
const quantity = ref(1)
const minForFace = computed(() => faces.value[face.value - 1]?.min ?? 1)
const canBid = computed(() => isLegalBid(props.view.bid, { quantity: quantity.value, face: face.value }, props.settings.wildOnes) && quantity.value <= props.view.totalDice)

function pickFace(f: number) {
  face.value = f
  quantity.value = Math.max(quantity.value, minForFace.value)
}

// Start each turn on the smallest legal raise of the current face (or twos when opening).
watch(
  () => [props.view.round, props.view.bids.length],
  () => {
    const start = faces.value.find((f) => f.allowed && f.face === (props.view.bid?.face ?? 2)) ?? faces.value.find((f) => f.allowed)
    face.value = start?.face ?? 2
    quantity.value = start?.min ?? 1
  },
  { immediate: true },
)
</script>
