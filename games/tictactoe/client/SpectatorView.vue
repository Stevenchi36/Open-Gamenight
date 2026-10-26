<template>
  <v-row>
    <v-col cols="12" md="8">
      <GameBoard :board="view.board" :line="view.line" :playable="false" large />
    </v-col>

    <v-col cols="12" md="4">
      <MarkChips :view="view" :room="room" :me="SPECTATOR_ID" size="large" />

      <StatusCard v-if="view.phase === 'PLAYING'" prominent :overline="`Game ${view.game}`" :title="`${name(view.turn)}'s move`">
        <span v-if="view.turn && !isConnected(room, view.turn)">They've lost connection. Their move waits for them.</span>
      </StatusCard>
      <template v-else>
        <StatusCard v-if="view.outcome === 'abandoned'" prominent title="Game over">A player left before it finished.</StatusCard>
        <StatusCard v-else-if="view.outcome === 'draw'" prominent overline="Full board" title="It's a draw" />
        <StatusCard v-else prominent color="success" overline="Three in a row" :title="`${name(view.winnerId)} wins`" />

        <div class="text-overline">Games won</div>
        <ScoreBoard :scores="view.scores" :room="room" :gained="gained" />
      </template>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
// The watch page's Tic-Tac-Toe: the board large, with the players, whose move it is and the result.
// The chips carry the scores during a game; the scoreboard joins them on the result.
import type { SpectatorViewProps } from '@wsfg/core/client'
import type { PlayerId } from '@wsfg/core/contract'
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { isConnected, nameOf, ScoreBoard, StatusCard } from '@wsfg/core/ui'
import { computed } from 'vue'
import type { TicTacToeSettings, TicTacToeView } from '../shared/index.ts'
import GameBoard from './GameBoard.vue'
import MarkChips from './MarkChips.vue'

const props = defineProps<SpectatorViewProps<TicTacToeView, TicTacToeSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const gained = computed(() => (props.view.winnerId ? { [props.view.winnerId]: 1 } : {}))
</script>
