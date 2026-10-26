<template>
  <div class="d-flex justify-center flex-wrap ga-2 mb-4">
    <v-chip
      v-for="mark in MARKS"
      :key="mark"
      :size="size"
      :color="view.turn === view.marks[mark] ? 'primary' : undefined"
      :variant="view.turn === view.marks[mark] ? 'flat' : 'tonal'"
      :prepend-icon="isConnected(room, view.marks[mark]) ? MARK_ICONS[mark] : 'mdi-wifi-off'"
    >
      {{ nameOf(room, view.marks[mark]) }}{{ view.marks[mark] === me ? ' (you)' : '' }}
      <strong class="ml-2">{{ view.scores[view.marks[mark]] ?? 0 }}</strong>
    </v-chip>
  </div>
</template>

<script setup lang="ts">
// A chip per mark: who plays it and their score; the turn is highlighted.
import type { PlayerId } from '@wsfg/core/contract'
import type { RoomView } from '@wsfg/core/protocol'
import { isConnected, nameOf } from '@wsfg/core/ui'
import type { Mark, TicTacToeView } from '../shared/index.ts'

defineProps<{ view: TicTacToeView; room: RoomView; me: PlayerId; size?: 'default' | 'large' }>()

const MARKS: Mark[] = ['X', 'O']
const MARK_ICONS: Record<Mark, string> = { X: 'mdi-close', O: 'mdi-circle-outline' }
</script>
