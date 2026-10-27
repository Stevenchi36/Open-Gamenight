<template>
  <div>
    <SeatChips :view="view" :room="room" :me="me" />

    <template v-if="view.phase === 'PLAYING'">
      <StatusCard v-if="view.you.seat === null" compact title="Watching">You'll play from the next game.</StatusCard>
      <StatusCard v-else-if="myTurn" compact color="primary" :overline="overline" title="Your move" />
      <StatusCard v-else compact :overline="overline" :title="`${name(view.turn)}'s move`">
        <span v-if="view.turn && !isConnected(room, view.turn)">{{ awayText }}</span>
      </StatusCard>
    </template>
    <template v-else>
      <StatusCard v-if="view.outcome === 'abandoned'" compact title="Game over">Not enough players were left to finish it.</StatusCard>
      <StatusCard v-else prominent :color="won ? 'success' : undefined" :overline="`${mostBoxes(view)} boxes`" :title="resultTitle(view, me, name)" />
    </template>

    <DotsBoard
      :grid="view.grid"
      :h="view.h"
      :v="view.v"
      :boxes="view.boxes"
      :last="view.last"
      :initials="initials"
      :playable="myTurn"
      :seat="view.you.seat"
      @draw="(line) => send({ type: 'draw', ...line })"
    />

    <template v-if="view.phase === 'RESULTS'">
      <ScoreBoard :scores="view.scores" :room="room" :gained="gained" class="mb-4" />
      <NextRoundButton :room="room" :me="me" label="New game" waiting-for="to start a new game" @next="send({ type: 'new_game' })" />
    </template>

    <WinCelebration
      :active="view.outcome === 'win'"
      :title="resultTitle(view, me, name)"
      :subtitle="`${mostBoxes(view)} boxes`"
      :standings="standings(view, me, name)"
      :colors="winnerConfetti(view)"
      :delay="400"
    />
  </div>
</template>

<script setup lang="ts">
import type { PlayViewProps } from '@ogn/core/client'
import type { PlayerId } from '@ogn/core/contract'
import { isConnected, nameOf, NextRoundButton, ScoreBoard, StatusCard, WinCelebration } from '@ogn/core/ui'
import { computed } from 'vue'
import { COLORS, type ClientAction, type DotsSettings, type DotsView } from '../shared/index.ts'
import DotsBoard from './DotsBoard.vue'
import SeatChips from './SeatChips.vue'
import { mostBoxes, resultTitle, standings, winnerConfetti } from './text.ts'

const props = defineProps<PlayViewProps<DotsView, ClientAction, DotsSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const myTurn = computed(() => props.view.phase === 'PLAYING' && props.view.turn === props.me)
const overline = computed(() => (props.view.you.seat === null ? '' : `You are ${COLORS[props.view.you.seat]} · close a box to go again`))
const initials = computed(() => props.view.seats.map((s) => name(s.id).trim().charAt(0).toUpperCase()))
const won = computed(() => props.view.winnerIds.includes(props.me))
const gained = computed(() => Object.fromEntries(props.view.winnerIds.map((id) => [id, 1])))
// Turns are skipped only while 3 or more are still in the game.
const awayText = computed(() =>
  props.view.seats.filter((s) => !s.left).length > 2
    ? "They've lost connection. Their turn passes on if they're not back soon."
    : "They've lost connection. Their move waits for them.",
)
</script>
