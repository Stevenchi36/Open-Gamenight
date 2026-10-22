<template>
  <div>
    <RoleCard :you="view.you" />
    <div class="text-h5 mb-1">Who is the imposter?</div>
    <div class="text-body-2 text-medium-emphasis mb-3">
      {{ canVote ? 'Tap a player. You can change your vote until everyone has voted.' : 'You are watching this round.' }}
    </div>

    <v-row dense class="mb-3">
      <v-col v-for="id in candidates" :key="id" cols="6" sm="4">
        <v-card
          :color="view.you.vote === id ? 'primary' : undefined"
          :variant="view.you.vote === id ? 'flat' : 'tonal'"
          :disabled="!canVote"
          class="text-center"
          @click="send({ type: 'cast_vote', targetId: id })"
        >
          <v-card-text class="py-5">
            <v-icon v-if="view.you.vote === id" class="mb-1">mdi-check-circle</v-icon>
            <div class="text-subtitle-1 font-weight-medium">{{ nameOf(room, id) }}</div>
            <div class="text-caption">{{ view.voted.includes(id) ? 'has voted' : 'thinking...' }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <div class="d-flex align-center text-body-2 mb-1">
      <span>{{ view.voted.length }} / {{ view.roundPlayers.length }} voted</span>
    </div>
    <v-progress-linear :model-value="(view.voted.length / Math.max(1, view.roundPlayers.length)) * 100" color="primary" rounded height="6" class="mb-4" />

    <!-- Empty in spoken mode. -->
    <ClueList v-if="view.clues.length > 0" :view="view" :room="room" />

    <v-btn v-if="isHost" block variant="tonal" prepend-icon="mdi-eye" @click="send({ type: 'end_voting' })">
      Reveal now
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ClueList from '../ClueList.vue'
import RoleCard from '../RoleCard.vue'
import { nameOf, type PhaseProps } from '../util.ts'

const props = defineProps<PhaseProps>()
const isHost = computed(() => props.room.hostId === props.me)
const canVote = computed(() => props.view.roundPlayers.includes(props.me))
const candidates = computed(() => props.view.roundPlayers.filter((id) => id !== props.me))
</script>
