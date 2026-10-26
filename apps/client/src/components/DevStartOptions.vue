<template>
  <div class="dev-start rounded pa-2 mb-3">
    <div class="text-label-medium text-medium-emphasis">Dev</div>
    <v-checkbox v-model="model.players" label="Open in dev players" density="compact" hide-details />
    <v-slider
      v-if="model.players"
      v-model="model.count"
      :min="2"
      :max="12"
      :step="1"
      label="Players"
      thumb-label
      hide-details
      class="ms-2 me-1"
    >
      <template #append>
        <span class="text-body-large font-weight-medium" style="min-width: 2ch">{{ model.count }}</span>
      </template>
    </v-slider>
    <v-checkbox v-model="model.watch" label="Open a spectator window" density="compact" hide-details />
    <div v-if="model.players || model.watch" class="text-body-small text-medium-emphasis mt-1">
      Each opens in its own window and this tab stays here, so P1 can take your seat. Opening both needs pop-ups
      allowed for this site.
    </div>
  </div>
</template>

<script setup lang="ts">
/** Dev only (HomePage renders it under import.meta.env.DEV): launch options for a new room. */
import type { DevLaunch } from '../lib/dev-windows.ts'

const model = defineModel<DevLaunch>({ required: true })
</script>

<style scoped>
.dev-start {
  border: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
