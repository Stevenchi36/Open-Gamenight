<template>
  <div>
    <ThemeCard :theme="view.theme" compact />

    <v-alert v-if="!playing" type="info" variant="tonal" class="mb-4">
      You joined during this round. You'll get a number from the next round.
    </v-alert>
    <template v-else>
      <!-- Phones lie on the table: the numbers show only while held, and the clue fields name ranks, not numbers. -->
      <HoldToReveal :label="cards.length === 1 ? 'Hold to see your number' : 'Hold to see your numbers'" class="mb-3">
        <div class="d-flex justify-center ga-8">
          <div v-for="(card, i) in cards" :key="card.id">
            <div class="text-label-large">{{ rankLabel(i) }}</div>
            <div class="text-display-large font-weight-bold">{{ card.number }}</div>
          </div>
        </div>
      </HoldToReveal>

      <v-card color="primary" variant="tonal" class="mb-4">
        <v-card-text>
          <div class="text-body-medium mb-3">Name something that fits the theme at your number. Don't say the number!</div>
          <div v-for="(card, i) in cards" :key="card.id" :class="{ 'mt-3': i > 0 }">
            <SubmitField
              v-if="card.clue === null || editing === card.id"
              v-model="drafts[card.id]"
              :label="`Clue for ${rankLabel(i).toLowerCase()}`"
              :maxlength="CLUE_MAX_LENGTH"
              send-label="Send clue"
              @submit="(text) => submitClue(card.id, text)"
            />
            <div v-else class="d-flex align-center ga-2">
              <div class="flex-grow-1" style="min-width: 0">
                <div class="text-body-small">{{ rankLabel(i) }}</div>
                <div class="text-body-large font-weight-medium" style="overflow-wrap: anywhere">{{ card.clue }}</div>
              </div>
              <v-btn variant="text" size="small" prepend-icon="mdi-pencil" @click="edit(card.id, card.clue)">Change</v-btn>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </template>

    <div class="text-title-large">The line</div>
    <div class="text-body-medium text-medium-emphasis mb-3">
      Talk it over and drag the clues into order, lowest number at the top. Anyone can move any card.
    </div>
    <LineEnd :theme="view.theme" end="low" />
    <OrderList :items="view.line" :disabled="!playing" @move="(itemId, to) => send({ type: 'move_item', itemId, to })">
      <template #item="{ item }">
        <LineCard :item="item" :room="room" :me="me">
          <template #append>
            <v-icon v-if="isReady(item.playerId)" size="small" color="success" :aria-label="`${nameOf(room, item.playerId)} is ready`">mdi-check-circle</v-icon>
          </template>
        </LineCard>
      </template>
    </OrderList>
    <LineEnd :theme="view.theme" end="high" />

    <div class="mt-6">
      <ProgressCount :done="view.ready.length" :total="view.roundPlayers.length" label="ready" />
      <template v-if="playing">
        <v-btn v-if="amReady" block size="large" variant="tonal" prepend-icon="mdi-undo" class="mb-2" @click="send({ type: 'set_ready', ready: false })">
          Not ready after all
        </v-btn>
        <v-btn v-else block size="x-large" color="primary" prepend-icon="mdi-check" class="mb-2" :disabled="unclued" @click="send({ type: 'set_ready', ready: true })">
          Ready: I'm happy with the order
        </v-btn>
        <div class="text-body-small text-medium-emphasis text-center mb-4">
          {{
            unclued
              ? 'Give your number a clue first.'
              : 'The cards turn over when everyone is ready. Any move or clue change clears everyone.'
          }}
        </div>
      </template>
      <v-btn v-if="amHost" block variant="tonal" prepend-icon="mdi-eye" @click="send({ type: 'reveal_now' })">Reveal now</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { HoldToReveal, isHost, nameOf, OrderList, ProgressCount, SubmitField } from '@ogn/core/ui'
import { computed, reactive, ref, watch } from 'vue'
import { CLUE_MAX_LENGTH } from '../../shared/index.ts'
import LineCard from '../LineCard.vue'
import LineEnd from '../LineEnd.vue'
import ThemeCard from '../ThemeCard.vue'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const amHost = computed(() => isHost(props.room, props.me))
const playing = computed(() => props.view.you.status === 'playing')
const cards = computed(() => props.view.you.cards)
const unclued = computed(() => cards.value.some((c) => c.clue === null))
const amReady = computed(() => props.view.ready.includes(props.me))
const isReady = (playerId: string) => props.view.ready.includes(playerId)

/** Your cards are lowest first, so their labels say which is which without the number. */
function rankLabel(i: number): string {
  const n = cards.value.length
  if (n === 1) return 'Your number'
  if (n === 2) return i === 0 ? 'Your lower number' : 'Your higher number'
  return ['Your lowest number', 'Your middle number', 'Your highest number'][i] ?? 'Your number'
}

// A draft survives a refused clue, so the player can fix it rather than retype it.
const drafts = reactive<Record<string, string>>({})
const editing = ref<string | null>(null)

function edit(id: string, clue: string | null) {
  drafts[id] = clue ?? ''
  editing.value = id
}

function submitClue(itemId: string, text: string) {
  props.send({ type: 'submit_clue', itemId, text })
  editing.value = null
}

// New numbers start with empty fields.
watch(
  () => props.view.round,
  () => {
    for (const id of Object.keys(drafts)) delete drafts[id]
    editing.value = null
  },
)
</script>
