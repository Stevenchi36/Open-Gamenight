<template>
  <v-container class="py-6" :style="{ maxWidth: tab === 'library' ? '760px' : '560px' }">
    <v-tabs v-model="tab" color="primary" grow class="mb-4">
      <v-tab value="join" prepend-icon="mdi-login">Join</v-tab>
      <v-tab value="library" prepend-icon="mdi-view-grid-outline">Game Library</v-tab>
    </v-tabs>

    <v-card v-if="current" class="mb-4" color="primary" variant="tonal">
      <v-card-text class="d-flex align-center flex-wrap ga-2">
        <div class="flex-grow-1">
          You're in room <span class="room-code font-weight-bold">{{ current.code }}</span>
        </div>
        <v-btn color="primary" :to="`/room/${current.code}`">Back to room</v-btn>
        <v-btn variant="text" @click="leaveRoom">Leave</v-btn>
      </v-card-text>
    </v-card>

    <GameLibrary v-if="tab === 'library'" :signed-in="!!user" @start="openStart" />

    <template v-else>
      <v-card class="mb-4">
        <v-card-title>Join a room</v-card-title>
        <v-card-text>
          <v-form @submit.prevent="join">
            <div class="text-body-medium mb-1">Room code</div>
            <v-otp-input
              v-model="code"
              length="4"
              type="text"
              class="mb-2 room-code"
              :disabled="joining"
              @update:model-value="(v: string) => (code = v.toUpperCase())"
            />
            <v-text-field v-model="name" label="Your name" maxlength="16" counter autocomplete="nickname" />
            <v-alert v-if="joinError" type="error" variant="tonal" density="compact" class="mb-4">{{ joinError }}</v-alert>
            <v-btn type="submit" color="primary" size="large" block :loading="joining" :disabled="code.length !== 4 || !name.trim()">
              Join
            </v-btn>
          </v-form>
          <div class="text-center text-body-medium mt-3">
            Putting the game on a TV? <router-link to="/watch">Watch a room</router-link> on that screen instead.
          </div>
        </v-card-text>
      </v-card>
  
      <v-card v-if="user">
        <v-card-title>Start a new room</v-card-title>
        <v-card-text>
          <v-form @submit.prevent="create()">
            <v-select
              v-model="gameId"
              :items="config.games"
              item-title="name"
              item-value="id"
              label="Game"
              :hint="selectedGame?.description"
              persistent-hint
              class="mb-3"
            />
            <v-text-field v-model="hostName" label="Your name in this room" maxlength="16" counter />
            <DevStartOptions v-if="DevStartOptions" v-model="devLaunch" />
            <v-btn type="submit" color="primary" variant="flat" size="large" block :loading="creating" :disabled="!hostName.trim() || !gameId">
              Create room
            </v-btn>
          </v-form>
        </v-card-text>
      </v-card>
      <p v-else class="text-center text-body-medium text-medium-emphasis">
        <router-link to="/login">Sign in</router-link> to start a room. Joining only needs a code.
      </p>
    </template>

    <v-dialog v-model="starting" max-width="400">
      <v-card :title="`Start ${startGame?.name ?? 'a room'}`">
        <v-card-text>
          <v-form id="start-room" @submit.prevent="startFromLibrary">
            <v-text-field v-model="hostName" label="Your name in this room" maxlength="16" counter autofocus />
            <DevStartOptions v-if="DevStartOptions" v-model="devLaunch" />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="starting = false">Cancel</v-btn>
          <v-btn type="submit" form="start-room" color="primary" variant="flat" :loading="creating" :disabled="!hostName.trim()">
            Create room
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameLibrary from '../components/GameLibrary.vue'
import { authClient } from '../lib/auth-client.ts'
import { config } from '../lib/config.ts'
import { devLaunchDefaults, openDevWindows } from '../lib/dev-windows.ts'
import { createRoom, joinRoom, lastName, leaveRoom, roomState, toast } from '../lib/room.ts'

const router = useRouter()
const route = useRoute()
// In the URL (?tab=library) so the library can be linked and Back returns to the same tab.
const tab = computed({
  get: () => (route.query.tab === 'library' ? 'library' : 'join'),
  set: (value: string) => void router.replace({ query: value === 'library' ? { tab: 'library' } : {} }),
})
const session = authClient.useSession()
const user = computed(() => session.value.data?.user ?? null)

const current = computed(() => roomState.room)
const code = ref('')
const name = ref(lastName())
const hostName = ref(lastName())
const gameId = ref<string | null>(null)
const joining = ref(false)
// Shown on the form rather than as a toast: retries would queue one toast each, long after a fix.
const joinError = ref<string | null>(null)
const creating = ref(false)
const selectedGame = computed(() => config.games.find((g) => g.id === gameId.value))
// Dev only, and the build drops the import. Hidden inside the dev-players frames themselves.
const DevStartOptions =
  import.meta.env.DEV && window.self === window.top
    ? defineAsyncComponent(() => import('../components/DevStartOptions.vue'))
    : null
const devLaunch = ref(devLaunchDefaults())

watch(
  () => config.games,
  (games) => {
    if (!gameId.value && games[0]) gameId.value = games[0].id
  },
  { immediate: true },
)
watch(
  user,
  (u) => {
    if (u && !hostName.value) hostName.value = u.name.slice(0, 16)
  },
  { immediate: true },
)

watch([code, name], () => (joinError.value = null))

async function join() {
  joining.value = true
  joinError.value = null
  try {
    const joined = await joinRoom(code.value.toUpperCase(), name.value.trim())
    void router.push(`/room/${joined}`)
  } catch (error) {
    joinError.value = (error as Error).message
  } finally {
    joining.value = false
  }
}

async function create(id = gameId.value) {
  if (!id) return
  // Opened now, while this still counts as the user's click; they navigate once the room exists.
  const devWindows = import.meta.env.DEV && DevStartOptions ? openDevWindows(devLaunch.value) : null
  creating.value = true
  try {
    const created = await createRoom(id, hostName.value.trim())
    if (devWindows) {
      devWindows.show(created)
      starting.value = false
      // Stay here: opening the room page would pull the seat back from P1.
      if (devWindows.blocked) toast('A window was blocked: allow pop-ups for this site to open both.', 'warning')
      return
    }
    void router.push(`/room/${created}`)
  } catch (error) {
    devWindows?.close()
    toast((error as Error).message, 'error')
  } finally {
    creating.value = false
  }
}

const starting = ref(false)
const startGameId = ref<string | null>(null)
const startGame = computed(() => config.games.find((g) => g.id === startGameId.value))
function openStart(id: string) {
  startGameId.value = id
  starting.value = true
}
function startFromLibrary() {
  if (hostName.value.trim()) void create(startGameId.value)
}
</script>
