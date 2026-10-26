<template>
  <div>
    <MarkChips :view="view" :room="room" :me="me" />

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

    <WinCelebration
      :active="view.outcome === 'win'"
      :title="view.winnerId === me ? 'You win!' : `${nameOf(room, view.winnerId)} wins!`"
      subtitle="Three in a row"
      :delay="400"
    />
  </div>
</template>

<script setup lang="ts">
import type { PlayViewProps } from '@wsfg/core/client'
import { isConnected, nameOf, NextRoundButton, ScoreBoard, StatusCard, WinCelebration } from '@wsfg/core/ui'
import { computed } from 'vue'
import type { ClientAction, TicTacToeSettings, TicTacToeView } from '../shared/index.ts'
import GameBoard from './GameBoard.vue'
import MarkChips from './MarkChips.vue'

const props = defineProps<PlayViewProps<TicTacToeView, ClientAction, TicTacToeSettings>>()

const myTurn = computed(() => props.view.phase === 'PLAYING' && props.view.turn === props.me)
const gained = computed(() => (props.view.winnerId ? { [props.view.winnerId]: 1 } : {}))
</script>
