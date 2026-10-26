<template>
  <div>
    <DiscChips :view="view" :room="room" :me="me" />

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
      :disc="view.you.disc"
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
import type { ClientAction, DropLineSettings, DropLineView } from '../shared/index.ts'
import DiscChips from './DiscChips.vue'
import DropBoard from './DropBoard.vue'

const props = defineProps<PlayViewProps<DropLineView, ClientAction, DropLineSettings>>()

const myTurn = computed(() => props.view.phase === 'PLAYING' && props.view.turn === props.me)
const overline = computed(() => `You are ${props.view.you.disc} · ${props.view.lineLength} in a row wins`)
const gained = computed(() => (props.view.winnerId ? { [props.view.winnerId]: 1 } : {}))
</script>
