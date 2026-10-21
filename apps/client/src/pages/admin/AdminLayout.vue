<template>
  <v-container class="py-4" style="max-width: 1200px">
    <v-row>
      <v-col cols="12" md="3">
        <v-card>
          <v-list nav density="comfortable">
            <v-list-subheader>Admin</v-list-subheader>
            <v-list-item prepend-icon="mdi-view-dashboard-outline" title="Overview" :to="{ name: 'admin' }" exact />
            <v-list-item prepend-icon="mdi-account-multiple-outline" title="Users" :to="{ name: 'admin-users' }" />
            <template v-for="game in gamesWithPages" :key="game.id">
              <v-list-subheader>{{ game.name }}</v-list-subheader>
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

const gamesWithPages = clientGames.filter((g) => g.adminPages?.length)
</script>
