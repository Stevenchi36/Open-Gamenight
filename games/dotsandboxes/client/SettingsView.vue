<template>
  <div>
    <SettingToggle
      label="Grid"
      :model-value="settings.grid"
      :items="gridItems"
      :hint="`${settings.grid + 1}×${settings.grid + 1} dots, ${settings.grid * settings.grid} boxes`"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => update({ ...settings, grid: v as Grid })"
    />
  </div>
</template>

<script setup lang="ts">
import { GRIDS, type DotsSettings, type Grid } from '../shared/index.ts'

defineProps<{ settings: DotsSettings; update: (s: DotsSettings) => void; isHost: boolean }>()

const gridItems = GRIDS.map((n) => ({ title: `${n}×${n}`, value: n }))
</script>
