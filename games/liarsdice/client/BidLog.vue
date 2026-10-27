<template>
  <v-card v-if="entries.length > 0" class="mb-4" :title="title">
    <v-card-text>
      <MoveLog :entries="entries" :large="large" />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
// This round's bids as a numbered move list, newest first; once called, the called bid and the
// call are coloured by how they went (see bidRows).
import type { PlayerId } from '@ogn/core/contract'
import type { RoomView } from '@ogn/core/protocol'
import { MoveLog, moveLogEntries, nameOf } from '@ogn/core/ui'
import { computed } from 'vue'
import type { LiarsDiceView } from '../shared/index.ts'
import { bidRows } from './text.ts'

const props = withDefaults(
  defineProps<{
    view: LiarsDiceView
    room: RoomView
    me: PlayerId
    title?: string
    large?: boolean
    /** Leave out the newest bid, when it's already shown big. */
    skipLatest?: boolean
  }>(),
  { title: "This round's bids", large: false, skipLatest: false },
)

const entries = computed(() =>
  moveLogEntries(
    bidRows(props.view, props.me, (id) => nameOf(props.room, id)),
    (r) => r.text,
    (r) => r.tone,
    { skipLatest: props.skipLatest, max: props.large ? 10 : Infinity },
  ),
)
</script>
