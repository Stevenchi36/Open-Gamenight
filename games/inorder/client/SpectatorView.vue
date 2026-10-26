<template>
  <SpectatorLayout>
    <template v-if="view.phase === 'ORDERING'">
      <ThemeCard :theme="view.theme" />
    </template>
    <template v-else-if="result">
      <StatusCard v-if="done" prominent :color="color" :overline="view.theme.text" :title="headline">{{ detail }}</StatusCard>
      <StatusCard v-else prominent :overline="view.theme.text" title="Turning the cards over…" />
    </template>

    <div class="tv-line">
      <LineEnd :theme="view.theme" end="low" />
      <!-- The move transition slides cards to their new places as the room rearranges the line. -->
      <TransitionGroup tag="div" name="line" class="d-flex flex-column ga-2" role="list">
        <v-card v-for="(item, i) in view.line" :key="item.id" variant="tonal" class="px-4 py-3" role="listitem">
          <LineCard :item="item" :room="room" :me="SPECTATOR_ID">
            <template #append>
              <template v-if="view.phase === 'ORDERING'">
                <v-icon v-if="view.ready.includes(item.playerId)" color="success" :aria-label="`${name(item.playerId)} is ready`">mdi-check-circle</v-icon>
              </template>
              <div v-else-if="i < turned" class="d-flex align-center ga-2 number--in">
                <v-icon :color="isWrong(item.id) ? 'error' : 'success'">{{ isWrong(item.id) ? 'mdi-close-circle' : 'mdi-check-circle' }}</v-icon>
                <v-avatar :color="isWrong(item.id) ? 'error' : 'success'" size="56" class="text-headline-small font-weight-bold">{{ item.number }}</v-avatar>
              </div>
              <v-avatar v-else variant="tonal" size="56"><v-icon>mdi-help</v-icon></v-avatar>
            </template>
          </LineCard>
        </v-card>
      </TransitionGroup>
      <LineEnd :theme="view.theme" end="high" />
    </div>

    <template #side>
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-label-large">Round {{ view.round }}{{ view.totalRounds !== null ? ` of ${view.totalRounds}` : '' }}</div>
          <LivesLeft :lives="view.lives" :max="view.maxLives" size="x-large" />
          <div class="text-body-large mt-2">
            Rounds cleared: <strong>{{ view.cleared }}</strong> · Perfect: <strong>{{ view.perfect }}</strong>
          </div>
        </v-card-text>
      </v-card>
      <template v-if="view.phase === 'ORDERING'">
        <div class="text-body-large text-center mb-2">Players drag the clues into order on their phones, lowest number at the top.</div>
        <WhoAnswered :room="room" :players="view.roundPlayers" :done="view.ready" label="ready" large />
      </template>
    </template>

    <WinCelebration :active="result?.outcome === 'won'" title="The team made it!" :subtitle="detail" :delay="celebrateDelay" />
  </SpectatorLayout>
</template>

<script setup lang="ts">
// The watch page's In Order: the theme's scale, the shared line of clues as the room arranges it
// (cards slide to their new places), who is ready and the lives left; no numbers until the
// reveal, then the cards turn over one by one as players see it. It's the view built for
// SPECTATOR_ID: no cards of its own.
import type { SpectatorViewProps } from '@wsfg/core/client'
import type { PlayerId } from '@wsfg/core/contract'
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { nameOf, SpectatorLayout, StatusCard, WhoAnswered, WinCelebration } from '@wsfg/core/ui'
import { computed, onUnmounted, ref, watch } from 'vue'
import type { InOrderSettings, InOrderView } from '../shared/index.ts'
import LineCard from './LineCard.vue'
import LineEnd from './LineEnd.vue'
import LivesLeft from './LivesLeft.vue'
import ThemeCard from './ThemeCard.vue'
import { roundDetail, roundHeadline, TURN_MS } from './reveal.ts'

const props = defineProps<SpectatorViewProps<InOrderView, InOrderSettings>>()

const name = (id: PlayerId | null) => nameOf(props.room, id)
const result = computed(() => props.view.result)
const isWrong = (id: string) => result.value?.wrong.includes(id) ?? false

// A reveal that arrives while watching turns the cards over one at a time; opened on the
// results, the TV shows them all turned.
const turned = ref(props.view.phase === 'RESULTS' ? props.view.line.length : 0)
const done = computed(() => turned.value >= props.view.line.length)
let timer: ReturnType<typeof setInterval> | undefined
watch(
  () => props.view.phase,
  (phase) => {
    clearInterval(timer)
    turned.value = 0
    if (phase !== 'RESULTS') return
    timer = setInterval(() => {
      if (done.value) clearInterval(timer)
      else turned.value++
    }, TURN_MS)
  },
)
onUnmounted(() => clearInterval(timer))
const celebrateDelay = computed(() => props.view.line.length * TURN_MS + 300)

const color = computed(() => {
  const r = result.value
  if (r?.outcome === 'lost') return 'error'
  return r?.outcome === 'won' || r?.livesLost === 0 ? 'success' : undefined
})
const headline = computed(() => (result.value ? roundHeadline(result.value, 'The team made it!') : ''))
const detail = computed(() => (result.value ? roundDetail(result.value, props.view) : ''))
</script>

<style scoped>
.tv-line :deep(.text-body-large) {
  font-size: 1.5rem !important;
}
.tv-line :deep(.text-body-small) {
  font-size: 1rem !important;
}
.line-move {
  transition: transform 0.35s ease;
}
.number--in {
  animation: number-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes number-in {
  from {
    transform: rotateY(90deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .line-move {
    transition: none;
  }
  .number--in {
    animation: none;
  }
}
</style>
