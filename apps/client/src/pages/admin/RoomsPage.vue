<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5">Rooms</h1>
      <v-spacer />
      <v-btn variant="text" prepend-icon="mdi-refresh" :loading="loading" @click="load">Refresh</v-btn>
    </div>

    <v-card>
      <v-data-table :headers="headers" :items="rooms" :loading="loading" item-value="code" density="comfortable" :items-per-page="50">
        <template #[`item.code`]="{ item }">
          <div class="room-code font-weight-bold">{{ item.code }}</div>
          <div class="text-caption text-medium-emphasis">{{ item.gameName }}</div>
        </template>
        <template #[`item.phase`]="{ item }">
          <v-chip size="small" variant="tonal" :color="item.phase === 'playing' ? 'success' : undefined">
            {{ item.phase === 'playing' ? 'Playing' : 'Lobby' }}
          </v-chip>
        </template>
        <template #[`item.players`]="{ item }">
          <div class="d-flex flex-wrap ga-1 py-1">
            <v-chip
              v-for="p in item.players"
              :key="p.name"
              size="small"
              :variant="p.connected ? 'tonal' : 'outlined'"
              :class="{ 'text-medium-emphasis': !p.connected }"
              :prepend-icon="p.isHost ? 'mdi-crown' : undefined"
              :title="p.connected ? undefined : 'Disconnected'"
            >
              {{ p.name }}
            </v-chip>
            <v-chip v-if="item.spectators > 0" size="small" variant="text" prepend-icon="mdi-television">
              {{ item.spectators }} watching
            </v-chip>
          </div>
        </template>
        <template #[`item.createdAt`]="{ item }">
          <div>{{ item.creatorName }}</div>
          <div class="text-caption text-medium-emphasis">{{ ago(item.createdAt) }}</div>
        </template>
        <template #[`item.lastActivity`]="{ item }">{{ ago(item.lastActivity) }}</template>
        <template #[`item.actions`]="{ item }">
          <div class="d-flex justify-end ga-1">
            <v-btn size="small" variant="tonal" prepend-icon="mdi-login" :to="{ name: 'room', params: { code: item.code } }">Join</v-btn>
            <v-btn size="small" variant="text" color="error" prepend-icon="mdi-close-circle-outline" @click="toClose = item">Close</v-btn>
          </div>
        </template>
        <template #no-data>No rooms are open.</template>
      </v-data-table>
    </v-card>
    <div class="text-caption text-medium-emphasis mt-2">
      Updates every {{ REFRESH_MS / 1000 }} seconds. Joining takes a seat like any player, and you can join a game in progress.
    </div>

    <v-dialog :model-value="!!toClose" max-width="400" @update:model-value="toClose = null">
      <v-card v-if="toClose" :title="`Close room ${toClose.code}?`">
        <v-card-text>
          Everyone in it ({{ toClose.players.length }} player{{ toClose.players.length === 1 ? '' : 's' }}) is sent out and told an
          admin closed it. Any game in progress ends.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="toClose = null">Cancel</v-btn>
          <v-btn color="error" @click="close(toClose)">Close room</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { serverNow, toast } from '../../lib/room.ts'

interface RoomSummary {
  code: string
  gameId: string
  gameName: string
  phase: 'lobby' | 'playing'
  creatorName: string
  createdAt: number
  lastActivity: number
  players: { name: string; connected: boolean; isHost: boolean; isLoggedIn: boolean }[]
  spectators: number
}

const REFRESH_MS = 10_000
const headers = [
  { title: 'Room', key: 'code' },
  { title: 'Status', key: 'phase' },
  { title: 'Players', key: 'players', sortable: false },
  { title: 'Opened', key: 'createdAt' },
  { title: 'Last active', key: 'lastActivity' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

const rooms = ref<RoomSummary[]>([])
const loading = ref(false)
const toClose = ref<RoomSummary | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

async function load() {
  loading.value = true
  const res = await fetch('/api/admin/rooms').catch(() => null)
  if (res?.ok) rooms.value = ((await res.json()) as { rooms: RoomSummary[] }).rooms
  loading.value = false
}

async function close(room: RoomSummary) {
  toClose.value = null
  const res = await fetch(`/api/admin/rooms/${room.code}/close`, { method: 'POST' })
  if (res.ok) toast(`Closed room ${room.code}`, 'success')
  else toast(((await res.json().catch(() => ({}))) as { message?: string }).message ?? `Request failed (${res.status})`, 'error')
  await load()
}

function ago(at: number): string {
  const minutes = Math.floor((serverNow() - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`
}

onMounted(() => {
  void load()
  timer = setInterval(() => void load(), REFRESH_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>
