<template>
  <v-container class="py-4" style="max-width: 1200px">
    <!-- Phones: the nav is a slide-out drawer so the page content comes first -->
    <template v-if="!mdAndUp">
      <v-navigation-drawer v-model="drawer" temporary>
        <v-list nav density="comfortable">
          <template v-for="item in navItems" :key="item.key">
            <v-list-subheader v-if="item.subheader">{{ item.title }}</v-list-subheader>
            <v-list-item v-else :prepend-icon="item.icon" :title="item.title" :to="item.to" :exact="item.exact" />
          </template>
        </v-list>
      </v-navigation-drawer>
      <v-btn variant="tonal" prepend-icon="mdi-menu" class="mb-4" @click="drawer = true">
        {{ currentTitle ?? 'Admin' }}
      </v-btn>
    </template>
    <v-row>
      <v-col v-if="mdAndUp" cols="3">
        <v-card>
          <v-list nav density="comfortable">
            <template v-for="item in navItems" :key="item.key">
              <v-list-subheader v-if="item.subheader">{{ item.title }}</v-list-subheader>
              <v-list-item v-else :prepend-icon="item.icon" :title="item.title" :to="item.to" :exact="item.exact" />
            </template>
          </v-list>
        </v-card>
      </v-col>
      <v-col cols="12" md="9">
        <router-view />
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
// UX only: the router guard and this page are conveniences; the server enforces admin on every route.
import { clientGames } from '@wsfg/games/client'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { useDisplay } from 'vuetify'

const route = useRoute()
const router = useRouter()
const { mdAndUp } = useDisplay()
const drawer = ref(false)
watch(() => route.fullPath, () => (drawer.value = false))

/** Games that use the shared categories table (reported by the server). */
const withCategories = ref(new Set<string>())
/** The Assistant needs the server's AI key. */
const aiEnabled = ref(false)
onMounted(async () => {
  const res = await fetch('/api/admin/status')
  if (!res.ok) return
  const status = (await res.json()) as { games: { id: string; hasCategories: boolean }[]; aiEnabled: boolean }
  withCategories.value = new Set(status.games.filter((g) => g.hasCategories).map((g) => g.id))
  aiEnabled.value = status.aiEnabled
})

type NavItem =
  | { key: string; subheader: true; title: string }
  | { key: string; subheader?: false; title: string; icon: string; to: RouteLocationRaw; exact?: boolean; game?: string }

// One list for both the desktop card and the phone drawer.
const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { key: 'h-admin', subheader: true, title: 'Admin' },
    { key: 'admin', title: 'Overview', icon: 'mdi-view-dashboard-outline', to: { name: 'admin' }, exact: true },
  ]
  if (aiEnabled.value) items.push({ key: 'chat', title: 'Assistant', icon: 'mdi-creation-outline', to: { name: 'admin-chat' } })
  items.push(
    { key: 'rooms', title: 'Rooms', icon: 'mdi-door-open', to: { name: 'admin-rooms' } },
    { key: 'users', title: 'Users', icon: 'mdi-account-multiple-outline', to: { name: 'admin-users' } },
  )
  for (const game of clientGames) {
    const hasCategories = withCategories.value.has(game.id)
    if (!game.adminPages?.length && !hasCategories) continue
    items.push({ key: `h-${game.id}`, subheader: true, title: game.name })
    if (hasCategories) {
      items.push({
        key: `${game.id}-categories`,
        title: 'Categories',
        icon: 'mdi-shape-outline',
        game: game.name,
        to: { name: 'admin-categories', params: { gameId: game.id } },
      })
    }
    for (const page of game.adminPages ?? []) {
      items.push({
        key: `${game.id}-${page.path}`,
        title: page.title,
        icon: 'mdi-puzzle-outline',
        game: game.name,
        to: { name: 'admin-game', params: { gameId: game.id, page: page.path } },
      })
    }
  }
  return items
})

/** The phone menu button names the page you're on. */
const currentTitle = computed(() => {
  const item = navItems.value.find((i) => !i.subheader && router.resolve(i.to).path === route.path)
  if (!item || item.subheader) return undefined
  return item.game ? `${item.game}: ${item.title}` : item.title
})
</script>
