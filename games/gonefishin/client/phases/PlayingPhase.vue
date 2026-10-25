<template>
  <div>
    <v-alert v-if="view.you.status === 'waiting'" type="info" variant="tonal" class="mb-4">
      You joined during this game. You'll be dealt in when the next game starts.
    </v-alert>

    <StatusCard v-if="last" compact :color="lastColor" :overline="myTurn ? 'Your turn' : `${nameOf(room, view.turn)}'s turn`">
      {{ moveText(last, me, (id) => nameOf(room, id)) }}
    </StatusCard>
    <StatusCard v-else compact overline="New game" :title="myTurn ? 'You go first' : `${nameOf(room, view.turn)} goes first`" />

    <FishTable :view="view" :room="room" :me="me" :tappable="myTurn ? targets : []" :selected="target" @select="(id) => (target = id)" />

    <template v-if="view.you.status === 'playing'">
      <div v-if="myTurn" class="text-body-2 text-center text-medium-emphasis mb-2">
        {{ rank ? (target ? '' : 'Now tap a player to ask.') : 'Tap a rank in your hand, then a player to ask.' }}
      </div>
      <HandCards :hand="view.you.hand" :selectable="myTurn" :selected="rank" class="mb-4" @select="(r) => (rank = r)" />
      <div v-if="view.you.hand.length === 0" class="text-center text-body-2 text-medium-emphasis mb-4">Your hand is empty.</div>
      <v-btn v-if="myTurn" block size="large" color="primary" class="mb-4" :disabled="!rank || !target" @click="ask">
        {{ rank && target ? `Ask ${nameOf(room, target)} for ${rankName(rank)}` : 'Ask' }}
      </v-btn>
      <div v-else class="text-center text-body-1 text-medium-emphasis mb-4">Waiting for {{ nameOf(room, view.turn) }}…</div>
    </template>

    <v-expansion-panels v-if="view.log.length > 1" variant="accordion">
      <v-expansion-panel title="Moves this game">
        <v-expansion-panel-text>
          <div v-for="(m, i) in [...view.log].reverse()" :key="view.log.length - i" class="text-body-2 mb-1">
            {{ moveText(m, me, (id) => nameOf(room, id)) }}
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup lang="ts">
import type { PlayerId } from '@wsfg/core/contract'
import { rankName, type Rank } from '@wsfg/core/kit'
import { nameOf, StatusCard } from '@wsfg/core/ui'
import { computed, ref, watch } from 'vue'
import FishTable from '../FishTable.vue'
import HandCards from '../HandCards.vue'
import type { PhaseProps } from '../props.ts'
import { moveText } from '../text.ts'

const props = defineProps<PhaseProps>()

const myTurn = computed(() => props.view.turn === props.me)
const last = computed(() => props.view.log.at(-1) ?? null)
// Green when the latest move went your way, red when it took your cards.
const lastColor = computed(() => {
  const m = last.value
  if (!m || m.targetId === null) return undefined
  if (m.askerId === props.me && (m.given > 0 || m.lucky)) return 'success'
  if (m.targetId === props.me && m.given > 0) return 'error'
  return undefined
})

/** Players who can be asked: everyone else still in the game with cards. */
const targets = computed(() => props.view.seats.filter((s) => s.id !== props.me && !s.left && s.cards > 0).map((s) => s.id))

const rank = ref<Rank | null>(null)
const target = ref<PlayerId | null>(null)

// A fresh choice after every move; with only one player to ask, they're picked already.
watch(
  () => [props.view.game, props.view.log.length, props.view.turn],
  () => {
    rank.value = null
    target.value = targets.value.length === 1 ? targets.value[0]! : null
  },
  { immediate: true },
)

function ask() {
  if (rank.value && target.value) props.send({ type: 'ask', targetId: target.value, rank: rank.value })
}
</script>
