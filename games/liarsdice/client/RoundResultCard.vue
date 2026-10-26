<template>
  <v-card variant="tonal" class="mb-4">
    <v-card-text>
      <div :class="large ? 'text-h6' : 'text-body-1'" class="mb-3">
        {{ nameOf(room, result.callerId) }} {{ result.call === 'liar' ? 'called liar on' : 'called spot on for' }}
        {{ nameOf(room, result.bid.playerId) }}'s <strong>{{ bidText(result.bid) }}</strong>. There
        {{ result.count === 1 ? 'was' : 'were' }} <strong>{{ result.count }}</strong>.
        <span v-if="result.loserId">{{ nameOf(room, result.loserId) }} loses a die.</span>
        <span v-else-if="result.gainerId">{{ nameOf(room, result.gainerId) }} was spot on and gets a die back.</span>
      </div>
      <div
        v-for="([id, dice], i) in Object.entries(result.dice)"
        :key="id"
        class="mb-2"
        :class="{ 'dice--in': stagger }"
        :style="stagger ? { animationDelay: `${i * 300}ms` } : undefined"
      >
        <div :class="large ? 'text-body-1' : 'text-caption'" class="text-medium-emphasis">{{ nameOf(room, id) }}</div>
        <DiceRow :dice="dice" :size="large ? 48 : 28" :highlight="result.bid.face" :wild-ones="wildOnes" />
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
// A settled challenge: who called what, the count, and every player's dice with the counted ones lit up.
// `large` and `stagger` are the TV's: bigger dice, and each player's turning up in turn.
import type { RoomView } from '@wsfg/core/protocol'
import { nameOf } from '@wsfg/core/ui'
import type { RoundResult } from '../shared/index.ts'
import DiceRow from './DiceRow.vue'
import { bidText } from './props.ts'

defineProps<{ result: RoundResult; room: RoomView; wildOnes: boolean; large?: boolean; stagger?: boolean }>()
</script>

<style scoped>
.dice--in {
  animation: dice-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
@keyframes dice-in {
  from {
    transform: rotateX(90deg);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dice--in {
    animation: none;
  }
}
</style>
