<template>
  <div>
    <SettingToggle
      label="Format"
      :model-value="settings.format"
      :items="formatItems"
      :hint="formatHints[settings.format]"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('format', v as Format)"
    />
    <SettingToggle
      label="Match colour"
      :model-value="settings.matchColour"
      :items="onOff"
      :hint="settings.matchColour ? 'Pairs need the same rank and colour (♠♣ or ♥♦)' : 'Any two cards of the same rank make a pair'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('matchColour', v as boolean)"
    />
    <SettingToggle
      label="Arrange hand"
      :model-value="settings.arrange"
      :items="onOff"
      :hint="settings.arrange ? 'Order or shuffle your own hand, to hide where the queen is' : 'Hands stay in the random order they were dealt'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('arrange', v as boolean)"
    />
  </div>
</template>

<script setup lang="ts">
import type { Format, OldMaidSettings } from '../shared/index.ts'

const props = defineProps<{ settings: OldMaidSettings; update: (s: OldMaidSettings) => void; isHost: boolean }>()

function set<K extends keyof OldMaidSettings>(key: K, value: OldMaidSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}

const onOff = [
  { title: 'On', value: true },
  { title: 'Off', value: false },
]
const formatItems = [
  { title: 'Classic', value: 'classic' },
  { title: 'Royale', value: 'royale' },
]
const formatHints: Record<Format, string> = {
  classic: 'Every round, everyone but the Old Maid scores a point',
  royale: 'The Old Maid is out each round; the last player in wins',
}
</script>
