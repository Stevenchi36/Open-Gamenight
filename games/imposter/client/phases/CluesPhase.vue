<template>
  <div>
    <RoleCard :you="view.you" />
    <TurnHeader v-bind="props" />

    <v-card v-if="myTurn" color="primary" variant="tonal" class="mb-4">
      <v-card-text>
        <div class="text-title-large mb-2">Your turn: one word</div>
        <SubmitField v-model="clue" label="Your clue" :maxlength="24" send-label="Send clue" :error="localError" @submit="submit" />
      </v-card-text>
    </v-card>
    <div v-else class="text-title-large text-center mb-4">
      {{ nameOf(room, view.turn.currentPlayerId) }} is thinking of a clue...
    </div>

    <ClueList :view="view" :room="room" />

    <v-btn v-if="amHost" block variant="tonal" prepend-icon="mdi-vote" @click="send({ type: 'start_voting' })">
      Skip to voting
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { isHost, nameOf, SubmitField } from '@wsfg/core/ui'
import { computed, ref } from 'vue'
import ClueList from '../ClueList.vue'
import RoleCard from '../RoleCard.vue'
import type { PhaseProps } from '../props.ts'
import TurnHeader from './TurnHeader.vue'

const props = defineProps<PhaseProps>()
const myTurn = computed(() => props.view.turn.currentPlayerId === props.me)
const amHost = computed(() => isHost(props.room, props.me))
const clue = ref('')
const localError = ref('')

function submit(word: string) {
  if (/\s/.test(word)) {
    localError.value = 'One word only'
    return
  }
  localError.value = ''
  props.send({ type: 'submit_clue', word })
  clue.value = ''
}
</script>
