<template>
  <div v-if="result">
    <StatusCard v-if="done" :prominent="result.outcome !== null" :color="color" :overline="view.theme.text" :title="headline">
      {{ detail }}
    </StatusCard>
    <StatusCard v-else compact :overline="view.theme.text" title="Turning the cards over…" />

    <LineEnd :theme="view.theme" end="low" />
    <div class="d-flex flex-column ga-2" role="list" @click="turned = view.line.length">
      <v-card v-for="(item, i) in view.line" :key="item.id" variant="tonal" class="px-4 py-2" role="listitem">
        <LineCard :item="item" :room="room" :me="me">
          <template #append>
            <div v-if="i < turned" class="d-flex align-center ga-1">
              <v-icon size="small" :color="isWrong(item.id) ? 'error' : 'success'">{{ isWrong(item.id) ? 'mdi-close-circle' : 'mdi-check-circle' }}</v-icon>
              <v-avatar :color="isWrong(item.id) ? 'error' : 'success'" size="44" class="text-h6 font-weight-bold">{{ item.number }}</v-avatar>
            </div>
            <v-avatar v-else variant="tonal" size="44"><v-icon>mdi-help</v-icon></v-avatar>
          </template>
        </LineCard>
      </v-card>
    </div>
    <LineEnd :theme="view.theme" end="high" />
    <div v-if="!done" class="text-center mt-2">
      <v-btn variant="text" size="small" @click="turned = view.line.length">Show all</v-btn>
    </div>

    <template v-if="done">
      <v-card variant="tonal" class="my-4">
        <v-card-text class="d-flex align-center flex-wrap ga-4">
          <LivesLeft :lives="view.lives" :max="view.maxLives" size="large" />
          <span class="text-body-1">
            Rounds cleared: <strong>{{ view.cleared }}</strong><template v-if="view.totalRounds !== null"> of {{ view.totalRounds }}</template>
          </span>
          <span class="text-body-1">Perfect rounds: <strong>{{ view.perfect }}</strong></span>
        </v-card-text>
      </v-card>

      <NextRoundButton
        :room="room"
        :me="me"
        :label="result.outcome ? 'New game' : 'Next round'"
        :waiting-for="result.outcome ? 'to start a new game' : 'to start the next round'"
        @next="send({ type: result.outcome ? 'new_game' : 'next_round' })"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { NextRoundButton, StatusCard } from '@wsfg/core/ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LineCard from '../LineCard.vue'
import LineEnd from '../LineEnd.vue'
import LivesLeft from '../LivesLeft.vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const isWrong = (id: string) => result.value?.wrong.includes(id) ?? false
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// The cards turn over one at a time, top to bottom; a tap on the line turns the rest.
const TURN_MS = 700
const turned = ref(0)
const done = computed(() => turned.value >= props.view.line.length)
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (done.value) clearInterval(timer)
    else turned.value++
  }, TURN_MS)
})
onUnmounted(() => clearInterval(timer))

const color = computed(() => {
  const r = result.value!
  if (r.outcome === 'lost') return 'error'
  return r.outcome === 'won' || r.livesLost === 0 ? 'success' : undefined
})

const headline = computed(() => {
  const r = result.value!
  if (r.outcome === 'won') return 'You made it!'
  if (r.outcome === 'lost') return 'Out of lives'
  return r.livesLost === 0 ? 'Perfect order!' : plural(r.livesLost, 'card out of place', 'cards out of place')
})

const detail = computed(() => {
  const r = result.value!
  const v = props.view
  const lost = r.livesLost === 0 ? 'No lives lost.' : `${plural(r.livesLost, 'life', 'lives')} lost.`
  if (r.outcome === 'won') return `${lost} Every round cleared, with ${plural(v.lives, 'life', 'lives')} to spare.`
  if (r.outcome === 'lost') return `${lost} The team cleared ${plural(v.cleared, 'round', 'rounds')}.`
  return `${lost} ${plural(v.lives, 'life', 'lives')} left.`
})
</script>
