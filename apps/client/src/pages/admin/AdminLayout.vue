<template>
  <v-container class="py-4" style="max-width: 1200px">
    <v-row>
      <v-col cols="12" md="3">
        <v-card>
          <v-list nav density="comfortable">
            <v-list-subheader>Admin</v-list-subheader>
            <v-list-item prepend-icon="mdi-view-dashboard-outline" title="Overview" :to="{ name: 'admin' }" exact />
            <v-list-item prepend-icon="mdi-door-open" title="Rooms" :to="{ name: 'admin-rooms' }" />
            <v-list-item prepend-icon="mdi-account-multiple-outline" title="Users" :to="{ name: 'admin-users' }" />
            <template v-for="game in gamesWithPages" :key="game.id">
              <v-list-subheader>{{ game.name }}</v-list-subheader>
              <v-list-item
                v-if="withCategories.has(game.id)"
                prepend-icon="mdi-shape-outline"
                title="Categories"
                :to="{ name: 'admin-categories', params: { gameId: game.id } }"
              />
              <v-list-item
                v-for="page in game.adminPages"
                :key="page.path"
                prepend-icon="mdi-puzzle-outline"
                :title="page.title"
                :to="{ name: 'admin-game', params: { gameId: game.id, page: page.path } }"
              />
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
import { computed, onMounted, ref } from 'vue'

/** Games that use the shared categories table (reported by the server). */
const withCategories = ref(new Set<string>())
onMounted(async () => {
  const res = await fetch('/api/admin/status')
  if (!res.ok) return
  const { games } = (await res.json()) as { games: { id: string; hasCategories: boolean }[] }
  withCategories.value = new Set(games.filter((g) => g.hasCategories).map((g) => g.id))
})

const gamesWithPages = computed(() => clientGames.filter((g) => g.adminPages?.length || withCategories.value.has(g.id)))
</script>
