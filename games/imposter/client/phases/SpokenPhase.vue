<template>
  <div>
    <RoleCard :you="view.you" />
    <TurnHeader v-bind="props" />

    <v-card :color="myTurn ? 'primary' : undefined" :variant="myTurn ? 'flat' : 'tonal'" class="mb-4 text-center">
      <v-card-text class="py-8">
        <template v-if="myTurn">
          <div class="text-overline">Your turn</div>
          <div class="text-h4 font-weight-bold mb-4">Say one word</div>
          <v-btn size="x-large" color="surface" @click="send({ type: 'end_turn' })">Done</v-btn>
        </template>
        <template v-else>
          <div class="text-overline">Speaking now</div>
          <div class="text-h4 font-weight-bold">{{ nameOf(room, view.turn.currentPlayerId) }}</div>
          <div v-if="!currentConnected" class="text-body-2 mt-2">Away. Skipping soon if they don't come back.</div>
        </template>
      </v-card-text>
    </v-card>

    <div v-if="isHost" class="d-flex ga-2">
      <v-btn v-if="!myTurn" class="flex-grow-1" variant="tonal" prepend-icon="mdi-skip-next" @click="send({ type: 'end_turn' })">
        Skip {{ nameOf(room, view.turn.currentPlayerId) }}
      </v-btn>
      <v-btn class="flex-grow-1" variant="tonal" prepend-icon="mdi-vote" @click="send({ type: 'start_voting' })">
        Start voting
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import RoleCard from '../RoleCard.vue'
import { isConnected, nameOf, type PhaseProps } from '../util.ts'
import TurnHeader from './TurnHeader.vue'

const props = defineProps<PhaseProps>()
const myTurn = computed(() => props.view.turn.currentPlayerId === props.me)
const isHost = computed(() => props.room.hostId === props.me)
const currentConnected = computed(() => !!props.view.turn.currentPlayerId && isConnected(props.room, props.view.turn.currentPlayerId))
</script>
