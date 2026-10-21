<template>
  <v-container class="py-6" style="max-width: 560px">
    <v-card v-if="current" class="mb-4" color="primary" variant="tonal">
      <v-card-text class="d-flex align-center flex-wrap ga-2">
        <div class="flex-grow-1">
          You're in room <span class="room-code font-weight-bold">{{ current.code }}</span>
        </div>
        <v-btn color="primary" :to="`/room/${current.code}`">Back to room</v-btn>
        <v-btn variant="text" @click="leaveRoom">Leave</v-btn>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-title>Join a room</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="join">
          <div class="text-body-2 mb-1">Room code</div>
          <v-otp-input
            v-model="code"
            length="4"
            type="text"
            class="mb-2 room-code"
            :disabled="joining"
            @update:model-value="(v: string) => (code = v.toUpperCase())"
          />
          <v-text-field v-model="name" label="Your name" maxlength="16" counter autocomplete="nickname" />
          <v-btn type="submit" color="primary" size="large" block :loading="joining" :disabled="code.length !== 4 || !name.trim()">
            Join
          </v-btn>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card v-if="user">
      <v-card-title>Start a new room</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="create">
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
          <v-btn type="submit" color="primary" variant="flat" size="large" block :loading="creating" :disabled="!hostName.trim() || !gameId">
            Create room
          </v-btn>
        </v-form>
      </v-card-text>
    </v-card>
    <p v-else class="text-center text-body-2 text-medium-emphasis">
      <router-link to="/login">Sign in</router-link> to start a room. Joining only needs a code.
    </p>
  </v-container>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authClient } from '../lib/auth-client.ts'
import { config } from '../lib/config.ts'
import { createRoom, joinRoom, lastName, leaveRoom, roomState, toast } from '../lib/room.ts'

const router = useRouter()
const session = authClient.useSession()
const user = computed(() => session.value.data?.user ?? null)

const current = computed(() => roomState.room)
const code = ref('')
const name = ref(lastName())
const hostName = ref(lastName())
const gameId = ref<string | null>(null)
const joining = ref(false)
const creating = ref(false)
const selectedGame = computed(() => config.games.find((g) => g.id === gameId.value))

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

async function join() {
  joining.value = true
  try {
    const joined = await joinRoom(code.value.toUpperCase(), name.value.trim())
    void router.push(`/room/${joined}`)
  } catch (error) {
    toast((error as Error).message, 'error')
  } finally {
    joining.value = false
  }
}

async function create() {
  if (!gameId.value) return
  creating.value = true
  try {
    const created = await createRoom(gameId.value, hostName.value.trim())
    void router.push(`/room/${created}`)
  } catch (error) {
    toast((error as Error).message, 'error')
  } finally {
    creating.value = false
  }
}
</script>
