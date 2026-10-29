<template>
  <div>
    <h1 class="text-headline-small mb-4">Games</h1>

    <v-card>
      <v-card-text v-if="!games">Loading...</v-card-text>
      <v-list v-else lines="two">
        <v-list-item v-for="game in games" :key="game.id" :title="game.name" :subtitle="game.description">
          <template #append>
            <v-switch
              :model-value="game.enabled"
              :loading="saving === game.id"
              :disabled="saving !== null || (game.enabled && enabledCount === 1)"
              :aria-label="`${game.name} on`"
              color="primary"
              hide-details
              inset
              @update:model-value="(on) => toggle(game, !!on)"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-card>
    <div class="text-body-small text-medium-emphasis mt-2">
      A game that's off is hidden from the Game Library, the start-room form and the lobby's game switcher. Rooms already
      playing it carry on, and its library and admin pages stay. At least one game has to stay on.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { loadConfig } from '../../lib/config.ts'
import { toast } from '../../lib/room.ts'

interface AdminGame {
  id: string
  name: string
  description: string
  enabled: boolean
}

const games = ref<AdminGame[] | null>(null)
const saving = ref<string | null>(null)
const enabledCount = computed(() => games.value?.filter((g) => g.enabled).length ?? 0)

async function toggle(game: AdminGame, enabled: boolean) {
  saving.value = game.id
  const res = await fetch(`/api/admin/games/${game.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled }),
  }).catch(() => null)
  saving.value = null
  if (!res?.ok) {
    const message = ((await res?.json().catch(() => ({}))) as { message?: string } | undefined)?.message
    toast(message ?? `Request failed (${res?.status ?? 'offline'})`, 'error')
    return
  }
  game.enabled = enabled
  toast(`${game.name} is ${enabled ? 'on' : 'off'}`, 'success')
  // This tab's menus update now; other open tabs pick it up on their next load.
  void loadConfig()
}

onMounted(async () => {
  const res = await fetch('/api/admin/games')
  if (res.ok) games.value = ((await res.json()) as { games: AdminGame[] }).games
})
</script>
