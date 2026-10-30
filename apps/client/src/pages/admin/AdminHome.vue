<template>
  <div>
    <h1 class="text-headline-small mb-4">Overview</h1>
    <v-card class="mb-4">
      <v-card-title class="d-flex align-center">
        Version
        <v-spacer />
        <v-btn
          v-if="updates && updates.check.state !== 'off' && updates.check.state !== 'unknown_version'"
          variant="text"
          size="small"
          prepend-icon="mdi-refresh"
          :loading="checking"
          @click="loadUpdates(true)"
        >
          Check again
        </v-btn>
      </v-card-title>
      <v-card-text v-if="!updates">Loading...</v-card-text>
      <v-card-text v-else>
        <div class="text-body-medium mb-2">
          <template v-if="updates.commit">
            Running <code>{{ updates.commit.slice(0, 7) }}</code>
            {{ updates.source === 'image' ? 'from the Docker image' : 'from a git checkout' }}.
          </template>
          <template v-else>This install can't tell which version it's running.</template>
        </div>

        <div v-if="check?.state === 'off'" class="text-body-medium">
          Update checks are off. Set <code>UPDATE_CHECK_REPO</code> on the server to turn them on.
        </div>
        <div v-else-if="check?.state === 'unknown_version'" class="text-body-medium">
          It has no <code>APP_COMMIT</code> and no <code>.git</code> folder, so it can't check for updates. Images from
          ghcr.io carry their version; one built locally with <code>docker compose build</code> doesn't.
        </div>
        <div v-else-if="check?.state === 'error'" class="text-body-medium">
          Couldn't check for updates: {{ check.message }}.
        </div>
        <template v-else-if="check?.state === 'checked'">
          <div v-if="check.status === 'current'" class="text-body-medium">Up to date with {{ updates.repo }} ({{ updates.branch }}).</div>
          <div v-else-if="check.status === 'ahead'" class="text-body-medium">
            This install has {{ plural(check.localCommits, 'commit') }} that {{ check.localCommits === 1 ? "isn't" : "aren't" }} on
            {{ updates.repo }} ({{ updates.branch }}), and nothing newer to fetch.
          </div>
          <v-alert v-else type="info" variant="tonal" density="comfortable">
            <div class="text-body-medium">
              A newer version is available: {{ plural(check.newCommits, 'new commit') }} on {{ updates.repo }} ({{ updates.branch }})<template
                v-if="check.status === 'diverged'"
              >, and this install has {{ plural(check.localCommits, 'commit') }} of its own</template>.
              <a :href="check.compareUrl" target="_blank" rel="noopener">See what's changed<v-icon icon="mdi-open-in-new" size="x-small" class="ms-1" /></a>
            </div>
            <div class="text-body-medium mt-2">To update, run this on the server:</div>
            <pre class="update-command text-body-medium mt-1"><code>{{ command }}</code></pre>
            <div v-if="updates.source === 'image'" class="text-body-small mt-1">
              A new image is published a few minutes after a commit passes CI.
            </div>
            <div class="text-body-small mt-2">
              <template v-if="updates.openRooms > 0">
                {{ updates.openRooms === 1 ? '1 room is' : `${updates.openRooms} rooms are` }} open right now, and updating ends
                {{ updates.openRooms === 1 ? 'it' : 'them' }}. See <router-link :to="{ name: 'admin-rooms' }">Rooms</router-link>.
              </template>
              <template v-else>No rooms are open, so now is a good time.</template>
            </div>
          </v-alert>
        </template>
        <div v-if="checkedAt" class="text-body-small text-medium-emphasis mt-2">Checked {{ checkedAt }}.</div>
      </v-card-text>
    </v-card>

    <v-card class="mb-4">
      <v-card-title>AI usage today</v-card-title>
      <v-card-text v-if="!usage">Loading...</v-card-text>
      <v-card-text v-else-if="!usage.enabled">
        AI generation is off. Set <code>ANTHROPIC_API_KEY</code> on the server to enable it.
      </v-card-text>
      <v-card-text v-else>
        <div class="d-flex text-body-medium mb-1">
          <span>{{ usage.outputTokens.toLocaleString() }} of {{ usage.cap.toLocaleString() }} output tokens</span>
          <v-spacer />
          <span>{{ usage.calls }} call{{ usage.calls === 1 ? '' : 's' }}</span>
        </div>
        <v-progress-linear :model-value="percent" :color="percent >= 90 ? 'error' : 'primary'" height="10" rounded />
        <div class="text-body-small text-medium-emphasis mt-2">Resets at midnight UTC. Shared by every game and admin.</div>
        <v-table v-if="usage.byGame.length" density="compact" class="mt-3">
          <thead>
            <tr><th>Game</th><th>Calls</th><th>Output tokens</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in usage.byGame" :key="row.gameId">
              <td>{{ row.gameId }}</td>
              <td>{{ row.calls }}</td>
              <td>{{ row.outputTokens.toLocaleString() }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title>Accounts</v-card-title>
      <v-card-text>
        Public sign-up is closed. Create accounts for people who should be able to start rooms under
        <router-link :to="{ name: 'admin-users' }">Users</router-link>. Guests never need an account to play.
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type Usage =
  | { enabled: false }
  | { enabled: true; outputTokens: number; calls: number; cap: number; byGame: { gameId: string; calls: number; outputTokens: number }[] }

/** GET /api/admin/updates (apps/server/src/updates.ts). */
interface Updates {
  commit: string | null
  source: 'image' | 'git' | null
  repo: string | null
  branch: string
  openRooms: number
  check:
    | { state: 'off' }
    | { state: 'unknown_version' }
    | { state: 'error'; message: string; checkedAt: number }
    | {
        state: 'checked'
        status: 'current' | 'behind' | 'ahead' | 'diverged'
        newCommits: number
        localCommits: number
        compareUrl: string
        checkedAt: number
      }
}

const usage = ref<Usage | null>(null)
const percent = computed(() => (usage.value?.enabled ? Math.min(100, (usage.value.outputTokens / Math.max(1, usage.value.cap)) * 100) : 0))

const updates = ref<Updates | null>(null)
const checking = ref(false)
const check = computed(() => updates.value?.check)
const command = computed(() =>
  updates.value?.source === 'image' ? 'docker compose pull && docker compose up -d' : 'npm run deploy   # or: git pull, pnpm install, pnpm build, restart',
)
const checkedAt = computed(() => {
  const c = check.value
  return c && 'checkedAt' in c ? new Date(c.checkedAt).toLocaleString() : null
})
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

async function loadUpdates(refresh = false) {
  checking.value = true
  try {
    const res = await fetch(`/api/admin/updates${refresh ? '?refresh=1' : ''}`)
    if (res.ok) updates.value = (await res.json()) as Updates
  } finally {
    checking.value = false
  }
}

onMounted(async () => {
  void loadUpdates()
  const res = await fetch('/api/admin/ai/usage')
  if (res.ok) usage.value = (await res.json()) as Usage
})
</script>

<style scoped>
.update-command {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
