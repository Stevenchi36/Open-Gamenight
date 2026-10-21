<template>
  <div>
    <h1 class="text-h5 mb-4">Overview</h1>
    <v-card class="mb-4">
      <v-card-title>AI usage today</v-card-title>
      <v-card-text v-if="!usage">Loading...</v-card-text>
      <v-card-text v-else-if="!usage.enabled">
        AI generation is off. Set <code>ANTHROPIC_API_KEY</code> on the server to enable it.
      </v-card-text>
      <v-card-text v-else>
        <div class="d-flex text-body-2 mb-1">
          <span>{{ usage.outputTokens.toLocaleString() }} of {{ usage.cap.toLocaleString() }} output tokens</span>
          <v-spacer />
          <span>{{ usage.calls }} call{{ usage.calls === 1 ? '' : 's' }}</span>
        </div>
        <v-progress-linear :model-value="percent" :color="percent >= 90 ? 'error' : 'primary'" height="10" rounded />
        <div class="text-caption text-medium-emphasis mt-2">Resets at midnight UTC. Shared by every game and admin.</div>
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

const usage = ref<Usage | null>(null)
const percent = computed(() => (usage.value?.enabled ? Math.min(100, (usage.value.outputTokens / Math.max(1, usage.value.cap)) * 100) : 0))

onMounted(async () => {
  const res = await fetch('/api/admin/ai/usage')
  if (res.ok) usage.value = (await res.json()) as Usage
})
</script>
