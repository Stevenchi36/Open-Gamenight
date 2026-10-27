<template>
  <div>
    <RoleCard :you="view.you" />
    <TurnHeader v-bind="props" />

    <StatusCard v-if="myTurn" color="primary" variant="flat" prominent overline="Your turn" title="Say one word">
      <v-btn size="x-large" color="surface" class="mt-2" @click="send({ type: 'end_turn' })">Done</v-btn>
    </StatusCard>
    <StatusCard v-else prominent overline="Speaking now" :title="nameOf(room, view.turn.currentPlayerId)">
      <div v-if="!currentConnected" class="text-body-medium">Away. Skipping soon if they don't come back.</div>
    </StatusCard>

    <div v-if="amHost" class="d-flex ga-2">
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
import { isConnected, isHost, nameOf, StatusCard } from '@ogn/core/ui'
import { computed } from 'vue'
import RoleCard from '../RoleCard.vue'
import type { PhaseProps } from '../props.ts'
import TurnHeader from './TurnHeader.vue'

const props = defineProps<PhaseProps>()
const myTurn = computed(() => props.view.turn.currentPlayerId === props.me)
const amHost = computed(() => isHost(props.room, props.me))
const currentConnected = computed(() => !!props.view.turn.currentPlayerId && isConnected(props.room, props.view.turn.currentPlayerId))
</script>
