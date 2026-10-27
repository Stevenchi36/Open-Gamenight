<template>
  <div>
    <v-card class="mb-4">
      <v-card-title class="d-flex align-center">
        Players
        <v-chip size="small" class="ml-2" variant="tonal" :color="tooMany ? 'error' : undefined">
          {{ room.players.length }}/{{ currentGame?.maxPlayers ?? 12 }}
        </v-chip>
      </v-card-title>
      <v-list density="comfortable">
        <v-list-item v-for="p in room.players" :key="p.id" :title="p.name">
          <template #prepend>
            <v-avatar :color="p.connected ? 'primary' : 'grey'" size="36" variant="tonal">
              {{ p.name.slice(0, 1).toUpperCase() }}
            </v-avatar>
          </template>
          <template #append>
            <v-chip v-if="p.isHost" size="x-small" color="amber" prepend-icon="mdi-crown" class="mr-1">Host</v-chip>
            <v-chip v-if="p.id === room.you.id" size="x-small" class="mr-1">You</v-chip>
            <v-chip v-if="!p.connected" size="x-small" variant="outlined" class="mr-1">Away</v-chip>
            <v-btn v-if="p.id === room.you.id" icon="mdi-pencil" size="small" variant="text" aria-label="Rename" @click="openRename" />
            <v-menu v-else-if="isHost">
              <template #activator="{ props: menu }">
                <v-btn v-bind="menu" icon="mdi-dots-vertical" size="small" variant="text" :aria-label="`Options for ${p.name}`" />
              </template>
              <v-list density="compact">
                <v-list-item prepend-icon="mdi-crown" title="Make host" @click="send({ type: 'transfer_host', playerId: p.id })" />
                <v-list-item prepend-icon="mdi-account-remove" title="Remove" @click="send({ type: 'kick', playerId: p.id })" />
              </v-list>
            </v-menu>
          </template>
        </v-list-item>
      </v-list>
    </v-card>

    <v-card class="mb-4">
      <v-card-title>Game</v-card-title>
      <v-card-text>
        <v-select
          v-if="isHost && room.availableGames.length > 1"
          :model-value="room.game.id"
          :items="room.availableGames"
          :item-title="gameTitle"
          item-value="id"
          label="Game"
          hint="Switching games resets settings and scores"
          persistent-hint
          class="mb-4"
          @update:model-value="(id: string) => send({ type: 'select_game', gameId: id })"
        />
        <div v-else class="text-title-large mb-1">{{ room.game.name }}</div>
        <div class="text-body-medium text-medium-emphasis mb-4">{{ currentGame?.description }}</div>
        <component :is="settingsView" v-if="settingsView" :settings="room.game.settings" :update="update" :is-host="isHost" />
      </v-card-text>
    </v-card>

    <v-btn
      v-if="isHost"
      color="primary"
      size="x-large"
      block
      :disabled="tooFew || tooMany"
      prepend-icon="mdi-play"
      @click="send({ type: 'start_game' })"
    >
      Start {{ room.game.name }}
    </v-btn>
    <div v-if="tooFew" class="text-center text-body-medium text-medium-emphasis mt-2">
      Waiting for players: {{ currentGame?.minPlayers }} needed to start.
    </div>
    <div v-else-if="tooMany" class="text-center text-body-medium text-error mt-2">
      Too many players: {{ room.game.name }} takes at most {{ currentGame?.maxPlayers }}.
      {{ isHost ? `Remove ${extra} or pick another game.` : `Waiting for ${hostName} to remove ${extra} or pick another game.` }}
    </div>
    <div v-else-if="!isHost" class="text-center text-body-large text-medium-emphasis mt-2">
      Waiting for {{ hostName }} to start the game.
    </div>

    <v-dialog v-model="renaming" max-width="360">
      <v-card title="Change your name">
        <v-card-text>
          <v-text-field v-model="newName" label="Name" maxlength="16" counter autofocus @keyup.enter="rename" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="renaming = false">Cancel</v-btn>
          <v-btn color="primary" :disabled="!newName.trim()" @click="rename">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import type { RoomView } from '@wsfg/core/protocol'
import { clientGames } from '@wsfg/games/client'
import { computed, defineAsyncComponent, ref, type Component } from 'vue'
import { gameTitle } from '../lib/games.ts'
import { send } from '../lib/room.ts'

const props = defineProps<{ room: RoomView }>()

const isHost = computed(() => props.room.hostId === props.room.you.id)
const currentGame = computed(() => props.room.availableGames.find((g) => g.id === props.room.game.id))
const tooFew = computed(() => props.room.players.length < (currentGame.value?.minPlayers ?? 1))
// The room keeps everyone when the host switches to a smaller game; the server refuses to start too.
const extra = computed(() => {
  const over = props.room.players.length - (currentGame.value?.maxPlayers ?? Infinity)
  return over === 1 ? '1 player' : `${over} players`
})
const tooMany = computed(() => props.room.players.length > (currentGame.value?.maxPlayers ?? Infinity))
const hostName =computed(() => props.room.players.find((p) => p.isHost)?.name ?? 'the host')

const settingsViews = new Map<string, Component>()
const settingsView = computed(() => {
  const module = clientGames.find((g) => g.id === props.room.game.id)
  if (!module) return null
  if (!settingsViews.has(module.id)) settingsViews.set(module.id, defineAsyncComponent(module.SettingsView))
  return settingsViews.get(module.id)!
})

function update(settings: unknown) {
  send({ type: 'update_settings', settings })
}

const renaming = ref(false)
const newName = ref('')
function openRename() {
  newName.value = props.room.players.find((p) => p.id === props.room.you.id)?.name ?? ''
  renaming.value = true
}
function rename() {
  send({ type: 'set_name', name: newName.value.trim() })
  renaming.value = false
}
</script>
