<template>
  <div>
    <div class="d-flex justify-center flex-wrap ga-2 mb-4">
      <v-chip
        v-for="mark in MARKS"
        :key="mark"
        :color="view.turn === view.marks[mark] ? 'primary' : undefined"
        :variant="view.turn === view.marks[mark] ? 'flat' : 'tonal'"
        :prepend-icon="isConnected(room, view.marks[mark]) ? MARK_ICONS[mark] : 'mdi-wifi-off'"
      >
        {{ nameOf(room, view.marks[mark]) }}{{ view.marks[mark] === me ? ' (you)' : '' }}
        <strong class="ml-2">{{ view.scores[view.marks[mark]] ?? 0 }}</strong>
      </v-chip>
    </div>

    <template v-if="view.phase === 'PLAYING'">
      <StatusCard v-if="!view.you.mark" compact title="Watching">You'll play from the next game.</StatusCard>
      <StatusCard v-else-if="myTurn" compact color="primary" :overline="`You are ${view.you.mark}`" title="Your move" />
      <StatusCard v-else compact :overline="`You are ${view.you.mark}`" :title="`${nameOf(room, view.turn)}'s move`">
        <span v-if="view.turn && !isConnected(room, view.turn)">They've lost connection. Their move waits for them.</span>
      </StatusCard>
    </template>
    <template v-else>
      <StatusCard v-if="view.outcome === 'abandoned'" compact title="Game over">A player left before it finished.</StatusCard>
      <StatusCard v-else-if="view.outcome === 'draw'" prominent overline="Full board" title="It's a draw" />
      <StatusCard
        v-else
        prominent
        :color="view.winnerId === me ? 'success' : undefined"
        overline="Three in a row"
        :title="view.winnerId === me ? 'You win!' : `${nameOf(room, view.winnerId)} wins`"
      />
    </template>

    <GameBoard :board="view.board" :line="view.line" :playable="myTurn" @place="(cell) => send({ type: 'place', cell })" />

    <template v-if="view.phase === 'RESULTS'">
      <ScoreBoard :scores="view.scores" :room="room" :gained="gained" class="mb-4" />
      <NextRoundButton :room="room" :me="me" label="New game" waiting-for="to start a new game" @next="send({ type: 'new_game' })" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PlayViewProps } from '@wsfg/core/client'
import { isConnected, nameOf, NextRoundButton, ScoreBoard, StatusCard } from '@wsfg/core/ui'
import { computed } from 'vue'
import type { ClientAction, Mark, TicTacToeSettings, TicTacToeView } from '../shared/index.ts'
import GameBoard from './GameBoard.vue'

const props = defineProps<PlayViewProps<TicTacToeView, ClientAction, TicTacToeSettings>>()

const MARKS: Mark[] = ['X', 'O']
const MARK_ICONS: Record<Mark, string> = { X: 'mdi-close', O: 'mdi-circle-outline' }

const myTurn = computed(() => props.view.phase === 'PLAYING' && props.view.turn === props.me)
const gained = computed(() => (props.view.winnerId ? { [props.view.winnerId]: 1 } : {}))
</script>
