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
    <SettingToggle
      label="Move history"
      :model-value="settings.moveHistory"
      :items="historyItems"
      :hint="historyHints[settings.moveHistory]"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('moveHistory', v as MoveHistory)"
    />
  </div>
</template>

<script setup lang="ts">
import type { MoveHistory } from '@ogn/core/kit'
import type { GoneFishinSettings } from '../shared/index.ts'

const props = defineProps<{ settings: GoneFishinSettings; update: (s: GoneFishinSettings) => void; isHost: boolean }>()

function set<K extends keyof GoneFishinSettings>(key: K, value: GoneFishinSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}

const onOff = [
  { title: 'On', value: true },
  { title: 'Off', value: false },
]
const historyItems = [
  { title: 'Off', value: 'off' },
  { title: 'Last 5', value: 'last5' },
  { title: 'All', value: 'all' },
]
const historyHints: Record<MoveHistory, string> = {
  off: 'No list of past moves: remember who asked for what yourself',
  last5: 'A list of the last 5 moves, as a reminder',
  all: 'A list of every move this game',
}
</script>
