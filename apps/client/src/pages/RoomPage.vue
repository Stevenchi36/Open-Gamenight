<template>
  <v-container :class="playing ? 'pt-2 pb-4' : 'py-4'" style="max-width: 760px">
    <template v-if="room">
      <div v-if="!playing" class="d-flex align-center flex-wrap ga-2 mb-4">
        <div>
          <div class="text-body-small text-medium-emphasis">Room code</div>
          <div class="text-headline-small room-code font-weight-bold">{{ room.code }}</div>
        </div>
        <WatcherCount v-if="room.spectators > 0" :count="room.spectators" />
        <v-spacer />
        <RulesDialog v-if="gameModule" :game="gameModule">
          <template #activator="{ props: activator }">
            <v-btn
              v-bind="activator"
              icon="mdi-help-circle-outline"
              variant="tonal"
              title="How to play"
              aria-label="How to play"
            />
          </template>
        </RulesDialog>
        <v-tooltip v-model="inviteTip" location="bottom" :text="inviteCopied ? 'Invite link copied' : 'Invite'">
          <template #activator="{ props: tip }">
            <v-btn
              v-bind="tip"
              :icon="inviteCopied ? 'mdi-check' : 'mdi-link-variant'"
              variant="tonal"
              aria-label="Invite"
              @click="copyLink"
            />
          </template>
        </v-tooltip>
        <v-btn icon="mdi-exit-run" variant="text" title="Leave" aria-label="Leave" @click="leave" />
      </div>
      <!-- Floated, so the play view's top row (round, score) wraps beside them instead of under them. -->
      <template v-else>
        <v-btn
          class="menu-button"
          icon="mdi-menu"
          size="small"
          density="comfortable"
          variant="tonal"
          aria-label="Room menu"
          @click="menu = true"
        />
        <WatcherCount v-if="room.spectators > 0" class="watchers" :count="room.spectators" />
      </template>

      <LobbyView v-if="room.phase === 'lobby'" :room="room" />
      <component
        :is="playView"
        v-else-if="playView && game"
        :view="game"
        :send="sendAction"
        :me="room.you.id"
        :room="room"
        :settings="room.game.settings"
        :server-now="serverNow"
      />
      <AttentionGlow v-if="actionNeeded" />

      <!-- During a game the room's controls live here, out of the way; the app bar is hidden too. -->
      <v-navigation-drawer v-if="playing" v-model="menu" temporary location="right" width="280">
        <div class="pa-4">
          <div class="text-body-small text-medium-emphasis">Room code</div>
          <div class="text-headline-large room-code font-weight-bold">{{ room.code }}</div>
          <WatcherCount v-if="room.spectators > 0" class="mt-1" :count="room.spectators" />
        </div>
        <v-divider />
        <v-list nav>
          <RulesDialog v-if="gameModule" :game="gameModule">
            <template #activator="{ props: activator }">
              <v-list-item v-bind="activator" prepend-icon="mdi-help-circle-outline" title="How to play" @click="menu = false" />
            </template>
          </RulesDialog>
          <v-list-item prepend-icon="mdi-link-variant" title="Invite" @click="copyLink" />
          <v-list-item prepend-icon="mdi-television" title="Show on TV" @click="openTv" />
          <v-list-item
            :prepend-icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
            :title="isDark ? 'Light theme' : 'Dark theme'"
            @click="toggleTheme"
          />
        </v-list>
        <!-- At the bottom, apart from the rest, so they aren't tapped by accident. -->
        <template #append>
          <v-divider />
          <v-list nav>
            <v-list-item v-if="isHost" prepend-icon="mdi-arrow-left" title="Back to lobby" @click="askLobby" />
            <v-list-item prepend-icon="mdi-exit-run" title="Leave room" @click="leave" />
          </v-list>
        </template>
      </v-navigation-drawer>

      <v-dialog v-model="showTv" max-width="420">
        <v-card title="Show the game on a TV">
          <v-card-text>
            <p class="mb-3">
              On the TV (or any big screen), open <strong>{{ watchSite }}</strong> and enter the code
              <strong class="room-code">{{ room.code }}</strong>.
            </p>
            <p class="text-body-medium text-medium-emphasis">
              It shows the table for everyone, never anyone's hand or secret, and doesn't take a seat.
            </p>
          </v-card-text>
          <v-card-actions>
            <v-btn prepend-icon="mdi-link-variant" @click="copyWatchLink">Copy link</v-btn>
            <v-spacer />
            <v-btn @click="showTv = false">Done</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

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
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { clientGames } from '@wsfg/games/client'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, shallowRef, watch, watchEffect, type Component } from 'vue'
import { useRouter } from 'vue-router'
import AttentionGlow from '../components/AttentionGlow.vue'
import LobbyView from '../components/LobbyView.vue'
import RulesDialog from '../components/RulesDialog.vue'
import WatcherCount from '../components/WatcherCount.vue'
import { immersive } from '../lib/layout.ts'
import { joinRoom, lastName, leaveRoom, resumeSeat, roomState, savedRoom, send, sendAction, serverNow, toast } from '../lib/room.ts'
import { useThemeToggle } from '../lib/theme.ts'

const props = defineProps<{ code: string }>()
const router = useRouter()

// Not a spectator's view, which can linger for a moment after leaving the watch page.
const room = computed(() => {
  const r = roomState.room
  return r?.code === props.code && r.you.id !== SPECTATOR_ID ? r : null
})
const game = computed(() => roomState.game)
const isHost = computed(() => !!room.value && room.value.hostId === room.value.you.id)
const name = ref(lastName())
const joining = ref(false)
// On the form, not a toast, so retries don't queue up (see HomePage).
const joinError = ref<string | null>(null)
const confirmLobby = ref(false)
const rejoining = ref(false)
const showTv = ref(false)
const inviteTip = ref(false)
const inviteCopied = ref(false)
let inviteTimer: ReturnType<typeof setTimeout> | undefined
const menu = ref(false)
const watchSite = `${location.host}/watch`
const { isDark, toggleTheme } = useThemeToggle()

const playing = computed(() => room.value?.phase === 'playing')
watchEffect(() => (immersive.room = playing.value))
onUnmounted(() => (immersive.room = false))
watch(playing, () => (menu.value = false))

function openTv() {
  menu.value = false
  showTv.value = true
}

function askLobby() {
  menu.value = false
  confirmLobby.value = true
}

onMounted(() => {
  // A saved token for this room: the store sends `reconnect` on (re)connect, and resumeSeat
  // covers an open socket (coming back from the watch page).
  if (!room.value && savedRoom()?.code === props.code) {
    resumeSeat(props.code)
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
  return gameModule.value?.needsAction?.(game.value, r.you.id, r, r.game.settings) ?? false
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
  if ((await shareLink(`${location.origin}/room/${props.code}`, 'Join my game')) !== 'copied') return
  // The lobby's button confirms on itself, a tooltip and a check; the in-game drawer's item toasts.
  if (playing.value) return toast('Invite link copied', 'success')
  inviteCopied.value = true
  inviteTip.value = true
  clearTimeout(inviteTimer)
  inviteTimer = setTimeout(() => {
    inviteTip.value = false
    // After the tooltip's fade, so its text doesn't flip back while it's still showing.
    inviteTimer = setTimeout(() => (inviteCopied.value = false), 300)
  }, 2000)
}

async function copyWatchLink() {
  if ((await shareLink(`${location.origin}/watch/${props.code}`, 'Watch our game')) === 'copied') {
    toast('Watch link copied', 'success')
  }
}

// Only devices with no mouse or trackpad get the share sheet: Windows Chrome and Edge have
// navigator.share too (touchscreen laptops included), and its flyout is easy to miss.
async function shareLink(url: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share && !matchMedia('(any-pointer: fine)').matches) {
      await navigator.share({ title, url })
      return 'shared'
    }
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    toast(url, 'info')
    return 'failed'
  }
}
</script>

<style scoped>
/* Centred on the play view's first line of text (28px button, 20px body-medium line); the negative
   bottom margin keeps it from also narrowing the card under that line. */
.menu-button {
  float: right;
  margin: -4px 0 -12px 8px;
}
/* Floated after the button, so it sits to its left on the same 20px line. */
.watchers {
  float: right;
  margin-left: 8px;
}
</style>
