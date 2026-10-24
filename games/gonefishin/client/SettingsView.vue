<template>
  <div>
    <SettingToggle
      label="Lucky catch"
      :model-value="settings.luckyCatch"
      :items="onOff"
      :hint="settings.luckyCatch ? 'Drawing the rank you asked for lets you ask again' : 'A miss always ends your turn'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('luckyCatch', v as boolean)"
    />
  </div>
</template>

<script setup lang="ts">
import type { GoneFishinSettings } from '../shared/index.ts'

const props = defineProps<{ settings: GoneFishinSettings; update: (s: GoneFishinSettings) => void; isHost: boolean }>()

function set<K extends keyof GoneFishinSettings>(key: K, value: GoneFishinSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}

const onOff = [
  { title: 'On', value: true },
  { title: 'Off', value: false },
]
</script>
