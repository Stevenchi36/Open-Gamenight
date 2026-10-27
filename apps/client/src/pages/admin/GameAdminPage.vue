<template>
  <component :is="page" v-if="page" />
  <v-alert v-else type="warning" variant="tonal">No such admin page.</v-alert>
</template>

<script setup lang="ts">
import { clientGames } from '@ogn/games/client'
import { computed, defineAsyncComponent, type Component } from 'vue'

const props = defineProps<{ gameId: string; page: string }>()
const cache = new Map<string, Component>()

const page = computed(() => {
  const key = `${props.gameId}/${props.page}`
  const def = clientGames.find((g) => g.id === props.gameId)?.adminPages?.find((p) => p.path === props.page)
  if (!def) return null
  if (!cache.has(key)) cache.set(key, defineAsyncComponent(def.component))
  return cache.get(key)!
})
</script>
