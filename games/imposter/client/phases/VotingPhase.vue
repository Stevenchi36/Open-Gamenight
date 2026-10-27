<template>
  <div>
    <RoleCard :you="view.you" />
    <div class="text-headline-small mb-1">Who is the imposter?</div>
    <div class="text-body-medium text-medium-emphasis mb-3">
      {{ canVote ? 'Tap a player. You can change your vote until everyone has voted.' : 'You are watching this round.' }}
    </div>

    <PlayerPicker
      :room="room"
      :players="candidates"
      :selected="view.you.vote"
      :disabled="!canVote"
      @pick="(id) => send({ type: 'cast_vote', targetId: id })"
    >
      <template #caption="{ id }">{{ view.voted.includes(id) ? 'has voted' : 'thinking...' }}</template>
    </PlayerPicker>
    <ProgressCount :done="view.voted.length" :total="view.roundPlayers.length" label="voted" />

    <!-- Empty in spoken mode. -->
    <ClueList v-if="view.clues.length > 0" :view="view" :room="room" />

    <v-btn v-if="amHost" block variant="tonal" prepend-icon="mdi-eye" @click="send({ type: 'end_voting' })">
      Reveal now
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { isHost, PlayerPicker, ProgressCount } from '@ogn/core/ui'
import { computed } from 'vue'
import ClueList from '../ClueList.vue'
import RoleCard from '../RoleCard.vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const amHost = computed(() => isHost(props.room, props.me))
const canVote = computed(() => props.view.roundPlayers.includes(props.me))
const candidates = computed(() => props.view.roundPlayers.filter((id) => id !== props.me))
</script>
