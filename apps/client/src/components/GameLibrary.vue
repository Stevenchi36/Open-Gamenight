<template>
  <div>
    <div class="d-flex align-center ga-2 mb-4">
      <v-text-field
        v-model="search"
        label="Search games"
        prepend-inner-icon="mdi-magnify"
        clearable
        hide-details
        density="comfortable"
        class="flex-grow-1"
      />
      <!-- A menu rather than inline fields or a dialog: it floats over the list, so opening it moves nothing. -->
      <v-menu v-model="filtersOpen" :close-on-content-click="false" location="bottom end" offset="8">
        <template #activator="{ props: activator }">
          <v-btn v-bind="activator" icon variant="text" :aria-label="filtersActive ? 'Filters (active)' : 'Filters'">
            <v-badge :model-value="filtersActive" dot color="primary">
              <v-icon icon="mdi-filter-variant" />
            </v-badge>
          </v-btn>
        </template>
        <v-card width="280">
          <v-card-text class="d-flex flex-column ga-4">
            <v-select v-model="style" :items="styleItems" label="Style" hide-details density="comfortable" />
            <v-select v-model="players" :items="playerItems" label="Players" hide-details density="comfortable" />
          </v-card-text>
          <v-card-actions class="pa-3 pt-0">
            <v-btn :disabled="!filtersActive" @click="clearChoices">Clear</v-btn>
            <v-spacer />
            <v-btn color="primary" @click="filtersOpen = false">Done</v-btn>
          </v-card-actions>
        </v-card>
      </v-menu>
    </div>

    <v-card v-for="game in filtered" :key="game.id" class="mb-3">
      <v-card-title class="d-flex align-center flex-wrap ga-2 px-5 pt-4">
        {{ game.name }}
        <v-chip size="small" variant="tonal" prepend-icon="mdi-account-group" class="players-chip">{{ playersText(game) }}</v-chip>
        <v-chip v-for="s in game.styles" :key="s" size="small" variant="outlined" @click="style = s">{{ GAME_STYLE_LABELS[s] }}</v-chip>
      </v-card-title>
      <v-card-text class="px-5">{{ game.description }}</v-card-text>
      <!-- 12px inset so the lg (8px) buttons' corners sit concentric with the card's 20px ones -->
      <v-card-actions class="flex-wrap pa-3 pt-0">
        <RulesDialog v-if="clientOf(game.id)" :game="clientOf(game.id)!">
          <template #activator="{ props: activator }">
            <v-btn v-bind="activator" prepend-icon="mdi-help-circle-outline">How to play</v-btn>
          </template>
        </RulesDialog>
        <v-spacer />
        <v-btn v-if="signedIn" color="primary" variant="flat" prepend-icon="mdi-plus" @click="emit('start', game.id)">Start a room</v-btn>
        <v-btn v-else to="/login" variant="text">Sign in to start</v-btn>
      </v-card-actions>
    </v-card>

    <div v-if="filtered.length === 0" class="text-center text-body-large text-medium-emphasis py-8">
      No games match.
      <v-btn variant="text" @click="clearFilters">Clear filters</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
// Every game: browse, filter by name, style and player count, read the rules; signed-in players can start a room.
import type { GameStyle } from '@ogn/core/contract'
import { GAME_STYLE_LABELS } from '@ogn/core/contract'
import type { AvailableGame } from '@ogn/core/protocol'
import { clientGames } from '@ogn/games/client'
import { computed, ref } from 'vue'
import { config } from '../lib/config.ts'
import { playerRange } from '../lib/games.ts'
import RulesDialog from './RulesDialog.vue'

defineProps<{ signedIn: boolean }>()
const emit = defineEmits<{ start: [gameId: string] }>()

const search = ref<string | null>('')
const style = ref<GameStyle | null>(null)
const players = ref<number | null>(null)
const filtersOpen = ref(false)
// Drives the dot on the filter button, since the choices are hidden while the menu is shut.
const filtersActive = computed(() => style.value !== null || players.value !== null)

// Only styles some game has, alphabetical by label.
const styleItems = computed(() => {
  const present = [...new Set(config.games.flatMap((g) => g.styles))]
  return [
    { title: 'Any style', value: null as GameStyle | null },
    ...present
      .map((s) => ({ title: GAME_STYLE_LABELS[s], value: s as GameStyle | null }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  ]
})

// Only counts some game can be played with.
const playerItems = computed(() => {
  const min = Math.min(...config.games.map((g) => g.minPlayers))
  const max = Math.max(...config.games.map((g) => g.maxPlayers))
  const counts = config.games.length > 0 ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : []
  return [
    { title: 'Any number', value: null as number | null },
    ...counts.map((n) => ({ title: `${n} player${n === 1 ? '' : 's'}`, value: n as number | null })),
  ]
})

const filtered = computed(() => {
  const q = (search.value ?? '').trim().toLowerCase()
  return config.games
    .filter(
      (g) =>
        (!q || g.name.toLowerCase().includes(q)) &&
        (style.value === null || g.styles.includes(style.value)) &&
        (players.value === null || (g.minPlayers <= players.value && players.value <= g.maxPlayers)),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
})

const clientOf = (id: string) => clientGames.find((g) => g.id === id)
const playersText = (g: AvailableGame) => `${playerRange(g)} players`

function clearChoices() {
  style.value = null
  players.value = null
}
function clearFilters() {
  search.value = ''
  clearChoices()
}
</script>

<style scoped>
/* The icon box is centred, but Roboto's digits sit above the line box's middle, so the icon read ~1px low next to them. */
.players-chip :deep(.v-icon) {
  transform: translateY(-1px);
}
</style>
