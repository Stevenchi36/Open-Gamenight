<template>
  <v-card variant="tonal" class="mb-4">
    <v-card-text>
      <div class="text-body-1 mb-3">
        {{ nameOf(room, result.callerId) }} {{ result.call === 'liar' ? 'called liar on' : 'called spot on for' }}
        {{ nameOf(room, result.bid.playerId) }}'s <strong>{{ bidText(result.bid) }}</strong>. There
        {{ result.count === 1 ? 'was' : 'were' }} <strong>{{ result.count }}</strong>.
        <span v-if="result.loserId">{{ nameOf(room, result.loserId) }} loses a die.</span>
        <span v-else-if="result.gainerId">{{ nameOf(room, result.gainerId) }} was spot on and gets a die back.</span>
      </div>
      <div v-for="(dice, id) in result.dice" :key="id" class="mb-2">
        <div class="text-caption text-medium-emphasis">{{ nameOf(room, String(id)) }}</div>
        <DiceRow :dice="dice" :size="28" :highlight="result.bid.face" :wild-ones="wildOnes" />
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
// A settled challenge: who called what, the count, and every player's dice with the counted ones lit up.
import type { RoomView } from '@wsfg/core/protocol'
import { nameOf } from '@wsfg/core/ui'
import type { RoundResult } from '../shared/index.ts'
import DiceRow from './DiceRow.vue'
import { bidText } from './props.ts'

defineProps<{ result: RoundResult; room: RoomView; wildOnes: boolean }>()
</script>
