<template>
  <v-container class="py-4" style="max-width: 760px">
    <template v-if="room">
      <div class="d-flex align-center flex-wrap ga-2 mb-4">
        <div>
          <div class="text-caption text-medium-emphasis">Room code</div>
          <div class="text-h5 room-code font-weight-bold">{{ room.code }}</div>
        </div>
        <v-spacer />
        <v-btn variant="tonal" prepend-icon="mdi-link-variant" @click="copyLink">Invite</v-btn>
        <v-btn v-if="isHost && room.phase === 'playing'" variant="tonal" prepend-icon="mdi-arrow-left" @click="confirmLobby = true">
          Lobby
        </v-btn>
        <v-btn variant="text" prepend-icon="mdi-exit-run" @click="leave">Leave</v-btn>
      </div>

      <LobbyView v-if="room.phase === 'lobby'" :room="room" />
      <component
        :is="playView"
        v-else-if="playView && game"
        :view="game"
        :send="sendAction"
        :me="room.you.id"
        :room="room"
        :server-now="serverNow"
      />
      <AttentionGlow v-if="actionNeeded" />

      <v-dialog v-model="confirmLobby" max-width="360">
        <v-card title="Back to the lobby?" text="This ends the current game for everyone. Scores reset.">
          <v-card-actions>
            <v-spacer />
            <v-btn @click="confirmLobby = false">Cancel</v-btn>
            <v-btn color="primary" @click="backToLobby">End game</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>

    <div v-else-if="rejoining" class="text-center py-12">
      <v-progress-circular indeterminate color="primary" class="mb-4" />
      <div>Rejoining room {{ code }}...</div>
    </div>

    <v-card v-else>
      <v-card-title>Join room <span class="room-code">{{ code }}</span></v-card-title>
      <v-card-text>
        <v-alert v-if="roomState.removedReason" type="info" variant="tonal" density="compact" class="mb-4">
          {{ roomState.removedReason }}
        </v-alert>
        <v-form @submit.prevent="join">
          <v-text-field v-model="name" label="Your name" maxlength="16" counter autofocus autocomplete="nickname" />
          <v-alert v-if="joinError" type="error" variant="tonal" density="compact" class="mb-4">{{ joinError }}</v-alert>
          <v-btn type="submit" color="primary" size="large" block :loading="joining" :disabled="!name.trim()">Join</v-btn>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn to="/" variant="text" prepend-icon="mdi-home">Home</v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { clientGames } from '@wsfg/games/client'
import { computed, defineAsyncComponent, onMounted, ref, shallowRef, watch, type Component } from 'vue'
import { useRouter } from 'vue-router'
import AttentionGlow from '../components/AttentionGlow.vue'
import LobbyView from '../components/LobbyView.vue'
import { joinRoom, lastName, leaveRoom, roomState, savedRoom, send, sendAction, serverNow, toast } from '../lib/room.ts'

const props = defineProps<{ code: string }>()
const router = useRouter()

const room = computed(() => (roomState.room?.code === props.code ? roomState.room : null))
const game = computed(() => roomState.game)
const isHost = computed(() => !!room.value && room.value.hostId === room.value.you.id)
const name = ref(lastName())
const joining = ref(false)
// On the form, not a toast, so retries don't queue up (see HomePage).
const joinError = ref<string | null>(null)
const confirmLobby = ref(false)
const rejoining = ref(false)

onMounted(() => {
  // A saved token for this room: the store sends `reconnect` on (re)connect.
  if (!room.value && savedRoom()?.code === props.code) {
    rejoining.value = true
    setTimeout(() => (rejoining.value = false), 5000)
  }
})
watch(room, (r) => {
  if (r) rejoining.value = false
})
watch(
  () => roomState.removedReason,
  (reason) => {
    if (reason) rejoining.value = false
  },
)

const gameModule = computed(() => clientGames.find((g) => g.id === room.value?.game.id))
const actionNeeded = computed(() => {
  const r = room.value
  if (!r || r.phase !== 'playing' || !game.value) return false
  return gameModule.value?.needsAction?.(game.value, r.you.id, r) ?? false
})

const views = new Map<string, Component>()
const playView = shallowRef<Component | null>(null)
watch(
  gameModule,
  (module) => {
    if (!module) return
    const { id } = module
    if (!views.has(id)) views.set(id, defineAsyncComponent(module.PlayView))
    playView.value = views.get(id)!
  },
  { immediate: true },
)

watch(name, () => (joinError.value = null))

async function join() {
  joining.value = true
  joinError.value = null
  try {
    await joinRoom(props.code, name.value.trim())
  } catch (error) {
    joinError.value = (error as Error).message
  } finally {
    joining.value = false
  }
}

function leave() {
  leaveRoom()
  void router.push('/')
}

function backToLobby() {
  confirmLobby.value = false
  send({ type: 'return_to_lobby' })
}

async function copyLink() {
  const url = `${location.origin}/room/${props.code}`
  try {
    if (navigator.share) await navigator.share({ title: 'Join my game', url })
    else {
      await navigator.clipboard.writeText(url)
      toast('Invite link copied', 'success')
    }
  } catch {
    toast(url, 'info')
  }
}
</script>
