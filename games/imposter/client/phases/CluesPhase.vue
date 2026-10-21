<template>
  <div>
    <RoleCard :you="view.you" />
    <TurnHeader v-bind="props" />

    <v-card v-if="myTurn" color="primary" variant="tonal" class="mb-4">
      <v-card-text>
        <div class="text-h6 mb-2">Your turn: one word</div>
        <v-form class="d-flex ga-2" @submit.prevent="submit">
          <v-text-field
            v-model="clue"
            label="Your clue"
            maxlength="24"
            autofocus
            autocomplete="off"
            autocapitalize="off"
            hide-details="auto"
            :error-messages="localError"
          />
          <v-btn type="submit" color="primary" size="large" :disabled="!clue.trim()" icon="mdi-send" aria-label="Send clue" />
        </v-form>
      </v-card-text>
    </v-card>
    <div v-else class="text-h6 text-center mb-4">
      {{ nameOf(room, view.turn.currentPlayerId) }} is thinking of a clue...
    </div>

    <v-card class="mb-4">
      <v-card-title class="text-subtitle-1">Clues</v-card-title>
      <v-card-text v-if="view.clues.length === 0" class="text-medium-emphasis">No clues yet.</v-card-text>
      <v-list v-else density="compact">
        <template v-for="(group, r) in grouped" :key="r">
          <v-list-subheader v-if="view.turn.totalRotations > 1">Rotation {{ r + 1 }}</v-list-subheader>
          <v-list-item v-for="c in group" :key="c.playerId + c.word" :title="c.word" :subtitle="nameOf(room, c.playerId)" />
        </template>
      </v-list>
    </v-card>

    <v-btn v-if="isHost" block variant="tonal" prepend-icon="mdi-vote" @click="send({ type: 'start_voting' })">
      Skip to voting
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import RoleCard from '../RoleCard.vue'
import { nameOf, type PhaseProps } from '../util.ts'
import TurnHeader from './TurnHeader.vue'

const props = defineProps<PhaseProps>()
const myTurn = computed(() => props.view.turn.currentPlayerId === props.me)
const isHost = computed(() => props.room.hostId === props.me)
const clue = ref('')
const localError = ref('')

const grouped = computed(() => {
  const groups: (typeof props.view.clues)[] = []
  for (const c of props.view.clues) (groups[c.rotation - 1] ??= []).push(c)
  return groups.filter(Boolean)
})

function submit() {
  const word = clue.value.trim()
  if (/\s/.test(word)) {
    localError.value = 'One word only'
    return
  }
  localError.value = ''
  props.send({ type: 'submit_clue', word })
  clue.value = ''
}
</script>
