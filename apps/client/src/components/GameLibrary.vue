<template>
  <div>
    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-text-field
        v-model="search"
        label="Search games"
        prepend-inner-icon="mdi-magnify"
        clearable
        hide-details
        density="comfortable"
        class="flex-grow-1"
        style="min-width: 200px"
      />
      <v-select
        v-model="players"
        :items="playerItems"
        label="Players"
        hide-details
        density="comfortable"
        style="min-width: 150px; max-width: 200px"
      />
    </div>

    <v-card v-for="game in filtered" :key="game.id" class="mb-3">
      <v-card-title class="d-flex align-center flex-wrap ga-2">
        {{ game.name }}
        <v-chip size="small" variant="tonal" prepend-icon="mdi-account-group">{{ playersText(game) }}</v-chip>
      </v-card-title>
      <v-card-text>{{ game.description }}</v-card-text>
      <v-card-actions class="flex-wrap">
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

    <div v-if="filtered.length === 0" class="text-center text-body-1 text-medium-emphasis py-8">
      No games match.
      <v-btn variant="text" @click="clearFilters">Clear filters</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
// Every game: browse, filter by name and player count, read the rules; signed-in players can start a room.
import type { AvailableGame } from '@wsfg/core/protocol'
import { clientGames } from '@wsfg/games/client'
import { computed, ref } from 'vue'
import { config } from '../lib/config.ts'
import RulesDialog from './RulesDialog.vue'

defineProps<{ signedIn: boolean }>()
const emit = defineEmits<{ start: [gameId: string] }>()

const search = ref<string | null>('')
const players = ref<number | null>(null)

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
  return config.games.filter(
    (g) =>
      (!q || g.name.toLowerCase().includes(q)) &&
      (players.value === null || (g.minPlayers <= players.value && players.value <= g.maxPlayers)),
  )
})

const clientOf = (id: string) => clientGames.find((g) => g.id === id)
const playersText = (g: AvailableGame) => (g.minPlayers === g.maxPlayers ? `${g.minPlayers} players` : `${g.minPlayers}-${g.maxPlayers} players`)

function clearFilters() {
  search.value = ''
  players.value = null
}
</script>
