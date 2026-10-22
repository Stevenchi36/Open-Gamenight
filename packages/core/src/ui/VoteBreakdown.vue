<template>
  <v-card class="mb-4">
    <v-card-title class="text-subtitle-1">{{ title }}</v-card-title>
    <v-card-text>
      <div v-for="row in tally" :key="row.id" class="mb-3">
        <div class="d-flex text-body-2">
          <span>{{ nameOf(room, row.id) }}<span v-if="markedLabel && row.id === markedId" class="text-error"> ({{ markedLabel }})</span></span>
          <v-spacer />
          <span>{{ row.voters.length }}</span>
        </div>
        <v-progress-linear
          :model-value="(row.voters.length / maxVotes) * 100"
          :color="row.id === markedId ? 'error' : 'primary'"
          rounded
          height="8"
        />
        <div class="d-flex flex-wrap ga-1 mt-1">
          <v-chip v-for="voter in row.voters" :key="voter" size="x-small" :color="row.id === markedId ? 'success' : undefined">
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
// Who voted for whom, most votes first. Only for after a vote: ballots are usually secret while voting.
import { computed } from 'vue'
import type { PlayerId } from '../contract.ts'
import type { RoomView } from '../protocol.ts'
import { nameOf } from './helpers.ts'

const props = withDefaults(
  defineProps<{
    room: RoomView
    /** Voter -> target. */
    ballots: Record<PlayerId, PlayerId>
    /** Everyone who could vote; the ones without a ballot are listed as not voting. */
    voters: PlayerId[]
    /** The target to single out (e.g. the imposter): drawn in the error colour, with the players who picked them in success. */
    markedId?: PlayerId | null
    markedLabel?: string
    title?: string
  }>(),
  { markedId: null, markedLabel: undefined, title: 'Votes' },
)

const tally = computed(() => {
  const rows = new Map<PlayerId, PlayerId[]>()
  for (const [voter, target] of Object.entries(props.ballots)) rows.set(target, [...(rows.get(target) ?? []), voter])
  return [...rows].map(([id, voters]) => ({ id, voters })).sort((a, b) => b.voters.length - a.voters.length)
})
const maxVotes = computed(() => Math.max(1, ...tally.value.map((r) => r.voters.length)))
const abstained = computed(() => props.voters.filter((id) => !(id in props.ballots)))
</script>
