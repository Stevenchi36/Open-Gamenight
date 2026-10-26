<template>
  <v-container class="py-4" :style="{ maxWidth: room ? '1400px' : '560px' }">
    <template v-if="room">
      <div class="watch-header mb-4">
        <div class="d-flex align-center flex-wrap ga-4">
          <div>
            <div class="text-caption text-medium-emphasis">Room code</div>
            <div class="text-h3 room-code font-weight-bold">{{ room.code }}</div>
          </div>
          <div>
            <div class="text-caption text-medium-emphasis">Join on your phone</div>
            <div class="text-h6">{{ joinUrl }}</div>
          </div>
        </div>
        <div class="text-h5 text-md-center">{{ room.game.name }}</div>
        <div class="d-flex align-center flex-wrap justify-md-end ga-2">
          <v-btn
            v-if="canFullscreen"
            variant="tonal"
            :prepend-icon="fullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
            @click="toggleFullscreen"
          >
            {{ fullscreen ? 'Exit full screen' : 'Full screen' }}
          </v-btn>
          <v-btn variant="text" prepend-icon="mdi-close" to="/">Stop watching</v-btn>
        </div>
      </div>

      <template v-if="room.phase === 'lobby'">
        <StatusCard prominent :overline="room.game.name" :title="`Waiting for ${nameOf(room, room.hostId)} to start`">
          {{ currentGame?.description }}
        </StatusCard>
        <PlayerChips :room="room" />
      </template>
      <component
        :is="spectatorView"
        v-else-if="spectatorView && game"
        :view="game"
        :room="room"
        :settings="room.game.settings"
        :server-now="serverNow"
      />
      <template v-else>
        <StatusCard prominent :overline="`Playing ${room.game.name}`" title="Follow along on your phones">
          This game doesn't have a TV view yet.
        </StatusCard>
        <PlayerChips :room="room" />
      </template>
    </template>

    <div v-else-if="code && !roomState.removedReason" class="text-center py-12">
      <v-progress-circular indeterminate color="primary" class="mb-4" />
      <div>Connecting to room {{ code }}...</div>
    </div>

    <v-card v-else>
      <v-card-title>Watch a room</v-card-title>
      <v-card-text>
        <p class="text-body-2 mb-4">
          Shows the game on this screen, for everyone to see. It doesn't take a seat, and it only shows what every player can see.
        </p>
        <v-alert v-if="roomState.removedReason" type="info" variant="tonal" density="compact" class="mb-4">
          {{ roomState.removedReason }}
        </v-alert>
        <v-form @submit.prevent="watchCode">
          <div class="text-body-2 mb-1">Room code</div>
          <v-otp-input
            v-model="entered"
            length="4"
            type="text"
            class="mb-2 room-code"
            @update:model-value="(v: string) => (entered = v.toUpperCase())"
          />
          <v-btn type="submit" color="primary" size="large" block :disabled="entered.length !== 4">Watch</v-btn>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn to="/" variant="text" prepend-icon="mdi-home">Home</v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
// The watch page: a display-only screen for a room (a TV everyone can see, or someone watching
// from elsewhere). It gets the view built for SPECTATOR_ID and shows the game's SpectatorView.
import { SPECTATOR_ID } from '@wsfg/core/protocol'
import { nameOf, StatusCard } from '@wsfg/core/ui'
import { clientGames } from '@wsfg/games/client'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, shallowRef, watch, watchEffect, type Component } from 'vue'
import { useRouter } from 'vue-router'
import PlayerChips from '../components/PlayerChips.vue'
import { immersive } from '../lib/layout.ts'
import { roomState, serverNow, stopWatching, watchRoom } from '../lib/room.ts'

const props = defineProps<{ code: string }>()
const router = useRouter()

const room = computed(() => {
  const r = roomState.room
  return r?.code === props.code && r.you.id === SPECTATOR_ID ? r : null
})
const game = computed(() => roomState.game)
const currentGame = computed(() => room.value?.availableGames.find((g) => g.id === room.value!.game.id))
const joinUrl = computed(() => `${location.host}/room/${props.code}`)
const entered = ref(props.code)

// A screen showing a room needs only its own header (code, join link, full screen, stop).
watchEffect(() => (immersive.watch = !!room.value))
onUnmounted(() => (immersive.watch = false))

watch(
  () => props.code,
  (code) => {
    if (code) watchRoom(code)
    else stopWatching()
  },
  { immediate: true },
)
onUnmounted(stopWatching)

function watchCode() {
  if (entered.value === props.code) watchRoom(props.code)
  else void router.push(`/watch/${entered.value}`)
}

const gameModule = computed(() => clientGames.find((g) => g.id === room.value?.game.id))
const views = new Map<string, Component>()
const spectatorView = shallowRef<Component | null>(null)
watch(
  gameModule,
  (module) => {
    if (!module?.SpectatorView) {
      spectatorView.value = null
      return
    }
    if (!views.has(module.id)) views.set(module.id, defineAsyncComponent(module.SpectatorView))
    spectatorView.value = views.get(module.id)!
  },
  { immediate: true },
)

// Full screen and a screen wake lock: a TV or laptop left showing the game shouldn't dim or sleep.
const canFullscreen = document.fullscreenEnabled
const fullscreen = ref(!!document.fullscreenElement)
const onFullscreen = () => (fullscreen.value = !!document.fullscreenElement)
function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen().catch(() => {})
}

let wakeLock: WakeLockSentinel | null = null
async function keepAwake() {
  if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return
  try {
    wakeLock = await navigator.wakeLock.request('screen')
  } catch {
    wakeLock = null // refused (battery saver, permissions): the screen may dim, nothing else breaks
  }
}
// The browser releases the lock when the tab is hidden; take it again on return.
const onVisibility = () => void keepAwake()

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreen)
  document.addEventListener('visibilitychange', onVisibility)
  void keepAwake()
})
onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreen)
  document.removeEventListener('visibilitychange', onVisibility)
  void wakeLock?.release().catch(() => {})
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
})
</script>

<style scoped>
/* Equal side columns keep the game name centred on the screen, not between the two sides. */
.watch-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
}
/* Below md (Vuetify's 960px) the three parts stack, left-aligned. */
@media (max-width: 959.98px) {
  .watch-header {
    grid-template-columns: 1fr;
  }
}
</style>
