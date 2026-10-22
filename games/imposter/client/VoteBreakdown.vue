<template>
  <v-card class="mb-4">
    <v-card-title class="text-subtitle-1">Votes</v-card-title>
    <v-card-text>
      <div v-for="row in tally" :key="row.id" class="mb-3">
        <div class="d-flex text-body-2">
          <span>{{ nameOf(room, row.id) }}<span v-if="row.id === result.imposterId" class="text-error"> (imposter)</span></span>
          <v-spacer />
          <span>{{ row.votes }}</span>
        </div>
        <v-progress-linear
          :model-value="(row.votes / maxVotes) * 100"
          :color="row.id === result.imposterId ? 'error' : 'primary'"
          rounded
          height="8"
        />
        <div class="d-flex flex-wrap ga-1 mt-1">
          <v-chip
            v-for="voter in row.voters"
            :key="voter"
            size="x-small"
            :color="row.id === result.imposterId ? 'success' : undefined"
          >
            {{ nameOf(room, voter) }}
          </v-chip>
        </div>
      </div>
      <div v-if="tally.length === 0" class="text-medium-emphasis">No votes were cast.</div>
      <div v-else-if="abstained.length > 0" class="text-body-2 text-medium-emphasis">
        Didn't vote: {{ abstained.map((id) => nameOf(room, id)).join(', ') }}
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { RoomView } from '@wsfg/core/protocol'
import { computed } from 'vue'
import type { ImposterView, ResultView } from '../shared/index.ts'
import { nameOf } from './util.ts'

const props = defineProps<{ result: ResultView; view: ImposterView; room: RoomView }>()

const tally = computed(() =>
  Object.entries(props.result.votes)
    .map(([id, votes]) => ({
      id,
      votes,
      voters: Object.keys(props.result.votedFor).filter((voter) => props.result.votedFor[voter] === id),
    }))
    .sort((a, b) => b.votes - a.votes),
)
const maxVotes = computed(() => Math.max(1, ...tally.value.map((r) => r.votes)))
const abstained = computed(() => props.view.roundPlayers.filter((id) => !(id in props.result.votedFor)))
</script>
