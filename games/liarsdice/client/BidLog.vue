<template>
  <MoveLogDialog v-if="dialog && entries.length > 0" :title="title" :entries="entries" block class="mb-4" />
  <v-card v-else-if="entries.length > 0" class="mb-4" :title="title">
    <v-card-text>
      <MoveLog :entries="entries" :large="large" />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
// The match's bids and calls as a numbered move list, newest first; in a called round the called
// bid and the call are coloured by how they went (see moveRows). Phones open it as a dialog, the TV
// shows it inline.
import type { PlayerId } from '@ogn/core/contract'
import type { RoomView } from '@ogn/core/protocol'
import { MoveLog, MoveLogDialog, moveLogEntries, nameOf } from '@ogn/core/ui'
import { computed } from 'vue'
import type { LiarsDiceView } from '../shared/index.ts'
import { moveRows } from './text.ts'

const props = withDefaults(
  defineProps<{
    view: LiarsDiceView
    room: RoomView
    me: PlayerId
    title?: string
    large?: boolean
    dialog?: boolean
    /** Leave out the newest bid, when it's already shown big. */
    skipLatest?: boolean
  }>(),
  { title: 'Moves this match', large: false, dialog: false, skipLatest: false },
)

const entries = computed(() =>
  moveLogEntries(
    moveRows(props.view, props.me, (id) => nameOf(props.room, id)),
    (r) => r.text,
    (r) => r.tone,
    { skipLatest: props.skipLatest, max: props.large ? 10 : Infinity },
  ),
)
</script>
