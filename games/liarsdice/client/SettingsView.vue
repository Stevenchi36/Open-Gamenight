<template>
  <div>
    <SettingSlider
      label="Starting dice"
      :model-value="settings.startingDice"
      :min="1"
      :max="6"
      hint="Dice per player at the start of a match"
      :disabled="!isHost"
      @update:model-value="(v: number) => set('startingDice', v)"
    />
    <SettingToggle
      label="Wild ones"
      :model-value="settings.wildOnes"
      :items="onOff"
      :hint="settings.wildOnes ? 'Ones count as every face; bidding on ones halves the quantity' : 'Ones are an ordinary face'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('wildOnes', v as boolean)"
    />
    <SettingToggle
      label="Spot on"
      :model-value="settings.spotOn"
      :items="onOff"
      :hint="settings.spotOn ? 'Call the bid exactly right to win a die back; wrong costs you one' : 'Only Liar! calls'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('spotOn', v as boolean)"
    />
  </div>
</template>

<script setup lang="ts">
import type { LiarsDiceSettings } from '../shared/index.ts'

const props = defineProps<{ settings: LiarsDiceSettings; update: (s: LiarsDiceSettings) => void; isHost: boolean }>()

function set<K extends keyof LiarsDiceSettings>(key: K, value: LiarsDiceSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}

const onOff = [
  { title: 'On', value: true },
  { title: 'Off', value: false },
]
</script>
