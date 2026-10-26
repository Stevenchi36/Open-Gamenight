<template>
  <v-app>
    <v-app-bar :model-value="!immersive.room && !immersive.watch" density="comfortable" flat border="b">
      <v-app-bar-title>
        <router-link to="/" class="text-decoration-none" style="color: inherit">{{ config.appName }}</router-link>
      </v-app-bar-title>
      <template #append>
        <v-btn
          :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          :aria-label="isDark ? 'Light theme' : 'Dark theme'"
          @click="toggleTheme"
        />
        <DevPlayersButton v-if="isDev && isAdmin" />
        <v-btn v-if="isAdmin" icon="mdi-shield-crown-outline" to="/admin" aria-label="Admin" />
        <v-btn v-if="!user && route.name !== 'login'" variant="text" to="/login">Sign in</v-btn>
        <v-menu v-else-if="user">
          <template #activator="{ props }">
            <v-btn v-bind="props" icon="mdi-account-circle" aria-label="Account" />
          </template>
          <v-list density="compact" min-width="200">
            <v-list-item :title="user.name" :subtitle="user.email" />
            <v-divider />
            <v-list-item prepend-icon="mdi-logout" title="Sign out" @click="signOut" />
          </v-list>
        </v-menu>
      </template>
    </v-app-bar>

    <v-main>
      <v-banner
        v-if="banner"
        :icon="banner.icon"
        :color="banner.color"
        lines="one"
        density="compact"
        sticky
        class="justify-center"
      >
        <v-banner-text>{{ banner.text }}</v-banner-text>
      </v-banner>
      <router-view />
    </v-main>

    <!-- overflow: a new toast replaces the current one instead of queueing behind it, so repeats can't pile up -->
    <v-snackbar-queue v-model="toasts" location="bottom" display-strategy="overflow" closable />
  </v-app>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authClient } from './lib/auth-client.ts'
import { config } from './lib/config.ts'
import { immersive } from './lib/layout.ts'
import { refreshSession, roomState, toasts } from './lib/room.ts'
import { useThemeToggle } from './lib/theme.ts'

const route = useRoute()
const router = useRouter()
const { theme, isDark, toggleTheme } = useThemeToggle()
const session = authClient.useSession()

const user = computed(() => session.value.data?.user ?? null)
const isAdmin = computed(() => (user.value as { role?: string } | null)?.role === 'admin')
// Dev only, and the build drops the import. Hidden inside the dev-players frames themselves.
const DevPlayersButton = import.meta.env.DEV ? defineAsyncComponent(() => import('./components/DevPlayersButton.vue')) : null
const isDev = !!DevPlayersButton && window.self === window.top

watch(
  () => config.primaryColor,
  (color) => {
    theme.themes.value.light!.colors.primary = color
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  },
  { immediate: true },
)

async function signOut() {
  await authClient.signOut()
  refreshSession()
  void router.push('/')
}

const banner = computed(() => {
  if (roomState.status === 'restarting') {
    return { text: 'The server is restarting, rejoin in a moment.', icon: 'mdi-restart', color: 'info' }
  }
  if (roomState.status === 'reconnecting' && roomState.room) {
    return { text: 'Connection lost. Reconnecting...', icon: 'mdi-wifi-off', color: 'warning' }
  }
  return null
})
</script>
