<template>
  <div>
    <MixCard :colors="view.colors" :deadline="view.deadline" :server-now="serverNow" />

    <v-alert v-if="view.you.status === 'waiting'" type="info" variant="tonal" class="mb-4">
      You joined during this round. You'll guess from the next round.
    </v-alert>
    <v-card v-else-if="view.you.guess === null || changing" variant="tonal" class="mb-4">
      <v-card-text>
        <div class="text-h6 mb-3">What colour do they make?</div>
        <v-color-picker
          v-model="pick"
          mode="hex"
          :modes="['hex', 'rgb', 'hsl']"
          width="100%"
          :canvas-height="180"
          elevation="0"
          class="mb-3"
        />
        <div class="d-flex align-center ga-3">
          <ColorDot :color="pickHex" :size="44" />
          <v-btn class="flex-grow-1" size="large" color="primary" prepend-icon="mdi-check" @click="submit">
            {{ view.you.guess === null ? 'Lock in my guess' : 'Change my guess' }}
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
    <template v-else>
      <!-- Phones lie on the table: keep the guess out of a neighbour's sight. -->
      <HoldToReveal label="Hold to see your guess" class="mb-2">
        <div class="text-overline">Your guess</div>
        <ColorDot :color="view.you.guess" :size="64" />
      </HoldToReveal>
      <div class="text-center mb-4">
        <v-btn variant="text" size="small" prepend-icon="mdi-pencil" @click="startChanging">Change my guess</v-btn>
      </div>
    </template>

    <ProgressCount :done="view.guessed.length" :total="view.roundPlayers.length" label="guessed" />
    <div v-if="waitingOn.length > 0 && view.guessed.length > 0" class="text-body-2 text-medium-emphasis text-center mb-4">
      Waiting for {{ waitingOn.map((id) => nameOf(room, id)).join(', ') }}
    </div>

    <v-btn v-if="amHost" block variant="tonal" prepend-icon="mdi-eye" @click="send({ type: 'reveal_guesses' })">
      Reveal now
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { HoldToReveal, isHost, nameOf, ProgressCount } from '@wsfg/core/ui'
import { computed, ref, watch } from 'vue'
import ColorDot from '../ColorDot.vue'
import MixCard from '../MixCard.vue'
import type { PhaseProps } from '../props.ts'

// Mid grey: a neutral start that doesn't hint at any answer.
const START = '#808080'

const props = defineProps<PhaseProps>()
const amHost = computed(() => isHost(props.room, props.me))
const waitingOn = computed(() => props.view.roundPlayers.filter((id) => !props.view.guessed.includes(id)))

const pick = ref<string>(START)
const changing = ref(false)
// The picker may add an alpha byte; the server wants #rrggbb.
const pickHex = computed(() => (pick.value || START).slice(0, 7).toLowerCase())

function submit() {
  props.send({ type: 'submit_guess', color: pickHex.value })
  changing.value = false
}

function startChanging() {
  pick.value = props.view.you.guess ?? START
  changing.value = true
}

// A new round starts from grey again.
watch(
  () => props.view.colors.join(),
  () => {
    pick.value = START
    changing.value = false
  },
)
</script>
