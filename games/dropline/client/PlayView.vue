<template>
  <div>
    <div class="d-flex justify-center flex-wrap ga-2 mb-4">
      <v-chip
        v-for="disc in DISCS"
        :key="disc"
        :color="view.turn === view.discs[disc] ? 'primary' : undefined"
        :variant="view.turn === view.discs[disc] ? 'flat' : 'tonal'"
        :prepend-icon="isConnected(room, view.discs[disc]) ? undefined : 'mdi-wifi-off'"
      >
        <span class="dl-dot mr-2" :class="`dl-dot--${disc}`" />
        {{ nameOf(room, view.discs[disc]) }}{{ view.discs[disc] === me ? ' (you)' : '' }}
        <strong class="ml-2">{{ view.scores[view.discs[disc]] ?? 0 }}</strong>
      </v-chip>
    </div>

    <template v-if="view.phase === 'PLAYING'">
      <StatusCard v-if="!view.you.disc" compact title="Watching">You'll play from the next game.</StatusCard>
      <StatusCard v-else-if="myTurn" compact color="primary" :overline="overline" title="Your move" />
      <StatusCard v-else compact :overline="overline" :title="`${nameOf(room, view.turn)}'s move`">
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
        :overline="`${view.lineLength} in a row`"
        :title="view.winnerId === me ? 'You win!' : `${nameOf(room, view.winnerId)} wins`"
      />
    </template>

    <DropBoard
      :columns="view.columns"
      :cols="view.cols"
      :rows="view.rows"
      :last="view.last"
      :line="view.line"
      :playable="myTurn"
      @drop="(column) => send({ type: 'drop', column })"
    />

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
import type { ClientAction, Disc, DropLineSettings, DropLineView } from '../shared/index.ts'
import DropBoard from './DropBoard.vue'

const props = defineProps<PlayViewProps<DropLineView, ClientAction, DropLineSettings>>()

const DISCS: Disc[] = ['red', 'blue']

const myTurn = computed(() => props.view.phase === 'PLAYING' && props.view.turn === props.me)
const overline = computed(() => `You are ${props.view.you.disc} · ${props.view.lineLength} in a row wins`)
const gained = computed(() => (props.view.winnerId ? { [props.view.winnerId]: 1 } : {}))
</script>

<style scoped>
.dl-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.dl-dot--red {
  background: #e53935;
}
.dl-dot--blue {
  background: #1e88e5;
}
</style>
