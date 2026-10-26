<template>
  <v-row>
    <v-col cols="12" md="8">
      <DropBoard
        :columns="view.columns"
        :cols="view.cols"
        :rows="view.rows"
        :last="view.last"
        :line="view.line"
        :playable="false"
        :disc="null"
        large
      />
    </v-col>

    <v-col cols="12" md="4">
      <DiscChips :view="view" :room="room" :me="SPECTATOR_ID" size="large" />

      <StatusCard v-if="view.phase === 'PLAYING'" prominent :overline="overline" :title="`${name(view.turn)}'s move`">
        <span v-if="view.turn && !isConnected(room, view.turn)">They've lost connection. Their move waits for them.</span>
      </StatusCard>
      <template v-else>
        <StatusCard v-if="view.outcome === 'abandoned'" prominent title="Game over">A player left before it finished.</StatusCard>
        <StatusCard v-else-if="view.outcome === 'draw'" prominent overline="Full board" title="It's a draw" />
        <StatusCard v-else prominent color="success" :overline="`${view.lineLength} in a row`" :title="`${name(view.winnerId)} wins`" />

        <div class="text-label-large">Games won</div>
        <ScoreBoard :scores="view.scores" :room="room" :gained="gained" />
      </template>
    </v-col>

    <WinCelebration
      :active="view.outcome === 'win'"
      :title="`${name(view.winnerId)} wins!`"
      :subtitle="`${view.lineLength} in a row`"
      :colors="winnerConfetti(view)"
      :delay="LANDED_MS"
    />
  </v-row>
</template>

<script setup lang="ts">
// The watch page's Drop Line: the board large, with the players, whose move it is and the result.
// The chips carry the scores during a game; the scoreboard joins them on the result.
import type { SpectatorViewProps } from '@wsfg/core/client'
import type { PlayerId } from '@wsfg/core/contract'
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { isConnected, nameOf, ScoreBoard, StatusCard, WinCelebration } from '@wsfg/core/ui'
import { computed } from 'vue'
import type { DropLineSettings, DropLineView } from '../shared/index.ts'
import { LANDED_MS, winnerConfetti } from './celebration.ts'
import DiscChips from './DiscChips.vue'
import DropBoard from './DropBoard.vue'

const props = defineProps<SpectatorViewProps<DropLineView, DropLineSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const overline = computed(() => `Game ${props.view.game} · ${props.view.lineLength} in a row wins`)
const gained = computed(() => (props.view.winnerId ? { [props.view.winnerId]: 1 } : {}))
</script>
