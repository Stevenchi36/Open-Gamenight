<template>
  <div>
    <SettingToggle
      label="Scoring"
      :model-value="settings.scoring"
      :items="scoringItems"
      :hint="settings.scoring === 'points' ? 'The winner scores the cards left in other hands' : '1 point for each round won'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('scoring', v as Scoring)"
    />
    <SettingSelect
      v-if="settings.scoring === 'points'"
      label="Target"
      :model-value="settings.target"
      :items="targetItems"
      hint="The first to reach it wins the game"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('target', v as LastCardSettings['target'])"
    />
    <SettingToggle
      label="Last card call"
      :model-value="settings.lastCall"
      :items="callItems"
      :hint="settings.lastCall === 'call' ? 'Press Last card! as you play your second-to-last card, or be caught and draw 2' : 'Called for you'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('lastCall', v as LastCall)"
    />
    <SettingToggle
      label="Stacking"
      :model-value="settings.stacking"
      :items="onOff"
      :hint="settings.stacking ? 'Answer a Draw Two or Wild Draw Four with another to pass it on' : 'A draw card is drawn straight away'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('stacking', v as boolean)"
    />
    <SettingToggle
      label="Draw until playable"
      :model-value="settings.drawUntilPlayable"
      :items="onOff"
      :hint="settings.drawUntilPlayable ? 'Keep drawing until you get a card you can play' : 'Draw one card'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('drawUntilPlayable', v as boolean)"
    />
    <SettingToggle
      label="7-0 swaps"
      :model-value="settings.sevenZero"
      :items="onOff"
      :hint="settings.sevenZero ? 'A 7 swaps hands with a player you pick; a 0 passes every hand on' : '7 and 0 are plain numbers'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('sevenZero', v as boolean)"
    />
    <SettingToggle
      label="Jump-in"
      :model-value="settings.jumpIn"
      :items="onOff"
      :hint="settings.jumpIn ? 'Play a card identical to the top card out of turn' : 'Only on your turn'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('jumpIn', v as boolean)"
    />
  </div>
</template>

<script setup lang="ts">
import { TARGETS, type LastCall, type LastCardSettings, type Scoring } from '../shared/index.ts'

const props = defineProps<{ settings: LastCardSettings; update: (s: LastCardSettings) => void; isHost: boolean }>()

function set<K extends keyof LastCardSettings>(key: K, value: LastCardSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}

const onOff = [
  { title: 'On', value: true },
  { title: 'Off', value: false },
]
const scoringItems = [
  { title: 'Points', value: 'points' as Scoring },
  { title: 'Rounds', value: 'rounds' as Scoring },
]
const targetItems = TARGETS.map((n) => ({ title: `${n} points`, value: n }))
const callItems = [
  { title: 'Call', value: 'call' as LastCall },
  { title: 'Automatic', value: 'auto' as LastCall },
]
</script>
