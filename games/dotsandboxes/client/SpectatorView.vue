<template>
  <v-row>
    <v-col cols="12" md="8">
      <DotsBoard
        :grid="view.grid"
        :h="view.h"
        :v="view.v"
        :boxes="view.boxes"
        :last="view.last"
        :initials="initials"
        :playable="false"
        :seat="null"
      />
    </v-col>

    <v-col cols="12" md="4">
      <SeatChips :view="view" :room="room" :me="SPECTATOR_ID" size="large" />

      <template v-if="view.phase === 'PLAYING'">
        <StatusCard prominent :overline="`Game ${view.game}`" :title="`${name(view.turn)}'s move`" />
      </template>
      <template v-else>
        <StatusCard v-if="view.outcome === 'abandoned'" prominent title="Game over">Not enough players were left to finish it.</StatusCard>
        <StatusCard v-else prominent color="success" :overline="`${mostBoxes(view)} boxes`" :title="resultTitle(view, SPECTATOR_ID, name)" />
      </template>

      <div class="text-overline">Games won</div>
      <ScoreBoard :scores="view.scores" :room="room" :gained="gained" />
    </v-col>

    <WinCelebration
      :active="view.outcome === 'win'"
      :title="resultTitle(view, SPECTATOR_ID, name)"
      :subtitle="`${mostBoxes(view)} boxes`"
      :standings="standings(view, SPECTATOR_ID, name)"
      :colors="winnerConfetti(view)"
      :delay="400"
    />
  </v-row>
</template>

<script setup lang="ts">
// The watch page's Dots and Boxes: the board large, with the seats, whose move it is and the games won.
import type { SpectatorViewProps } from '@wsfg/core/client'
import type { PlayerId } from '@wsfg/core/contract'
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { nameOf, ScoreBoard, StatusCard, WinCelebration } from '@wsfg/core/ui'
import { computed } from 'vue'
import type { DotsSettings, DotsView } from '../shared/index.ts'
import DotsBoard from './DotsBoard.vue'
import SeatChips from './SeatChips.vue'
import { mostBoxes, resultTitle, standings, winnerConfetti } from './text.ts'

const props = defineProps<SpectatorViewProps<DotsView, DotsSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const initials = computed(() => props.view.seats.map((s) => name(s.id).trim().charAt(0).toUpperCase()))
const gained = computed(() => Object.fromEntries(props.view.winnerIds.map((id) => [id, 1])))
</script>
