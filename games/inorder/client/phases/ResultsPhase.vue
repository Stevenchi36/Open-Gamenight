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
              <v-avatar :color="isWrong(item.id) ? 'error' : 'success'" size="44" class="text-title-large font-weight-bold">{{ item.number }}</v-avatar>
              <span class="d-sr-only">{{ isWrong(item.id) ? 'out of order' : 'in order' }}</span>
            </div>
            <v-avatar v-else variant="tonal" size="44"><v-icon>mdi-help</v-icon><span class="d-sr-only">not turned over yet</span></v-avatar>
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
          <span class="text-body-large">
            Rounds cleared: <strong>{{ view.cleared }}</strong><template v-if="view.totalRounds !== null"> of {{ view.totalRounds }}</template>
          </span>
          <span class="text-body-large">Perfect rounds: <strong>{{ view.perfect }}</strong></span>
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
import { NextRoundButton, StatusCard } from '@ogn/core/ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LineCard from '../LineCard.vue'
import LineEnd from '../LineEnd.vue'
import LivesLeft from '../LivesLeft.vue'
import type { PhaseProps } from '../props.ts'
import { roundDetail, roundHeadline, TURN_MS } from '../reveal.ts'

const props = defineProps<PhaseProps>()
const result = computed(() => props.view.result)
const isWrong = (id: string) => result.value?.wrong.includes(id) ?? false

// The cards turn over one at a time, top to bottom; a tap on the line turns the rest.
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

const headline = computed(() => roundHeadline(result.value!, 'You made it!'))
const detail = computed(() => roundDetail(result.value!, props.view))
</script>
