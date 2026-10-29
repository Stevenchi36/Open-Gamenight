<template>
  <div>
    <SettingToggle
      label="Claims"
      :model-value="settings.claims"
      :items="claimItems"
      :hint="settings.claims === 'next' ? 'Aces, then twos, threes … kings, and round again' : 'The same rank as the last claim, or one above or below'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('claims', v as Claims)"
    />
    <SettingToggle
      label="Call time"
      :model-value="settings.callSeconds"
      :items="callItems"
      hint="After each play, the time everyone gets to call Cheat! before the next play"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('callSeconds', v as CheatSettings['callSeconds'])"
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
import type { CheatSettings, Claims } from '../shared/index.ts'

const props = defineProps<{ settings: CheatSettings; update: (s: CheatSettings) => void; isHost: boolean }>()

function set<K extends keyof CheatSettings>(key: K, value: CheatSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}

const claimItems = [
  { title: 'Next rank', value: 'next' },
  { title: 'Nearby', value: 'nearby' },
]
const callItems = [
  { title: '3s', value: 3 },
  { title: '5s', value: 5 },
  { title: '10s', value: 10 },
  { title: '20s', value: 20 },
]
const historyItems = [
  { title: 'Off', value: 'off' },
  { title: 'Last 5', value: 'last5' },
  { title: 'All', value: 'all' },
]
const historyHints: Record<MoveHistory, string> = {
  off: "No list of past moves: remember what's been claimed yourself",
  last5: 'A list of the last 5 moves, as a reminder',
  all: 'A list of every move this game',
}
</script>
