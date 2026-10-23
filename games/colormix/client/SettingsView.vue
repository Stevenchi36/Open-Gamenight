<template>
  <div>
    <SettingSelect
      label="Rounds"
      :model-value="settings.rounds"
      :items="roundItems"
      :hint="settings.rounds === null ? 'Play as many rounds as you like' : 'The highest score after the last round wins'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('rounds', v as number | null)"
    />
    <SettingSelect
      label="Colours to mix"
      :model-value="settings.colorCount"
      :items="colorItems"
      :hint="settings.colorCount === 'random' ? `A new number each round, ${MIN_COLORS} to ${MAX_COLORS}` : undefined"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('colorCount', v as ColorMixSettings['colorCount'])"
    />
    <SettingToggle
      label="Scoring"
      :model-value="settings.scoring"
      :items="scoringItems"
      :hint="settings.scoring === 'ranked' ? '1 point for every player further away than you' : '1 point for the closest guess'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('scoring', v as Scoring)"
    />
    <SettingSelect
      label="Guess timer"
      :model-value="settings.guessTimerSeconds"
      :items="timerItems"
      :hint="settings.guessTimerSeconds ? 'Guesses are revealed when time runs out' : undefined"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('guessTimerSeconds', v as number | null)"
    />
  </div>
</template>

<script setup lang="ts">
import { GUESS_TIMERS, MAX_COLORS, MIN_COLORS, ROUND_COUNTS, type ColorMixSettings, type Scoring } from '../shared/index.ts'

const props = defineProps<{ settings: ColorMixSettings; update: (s: ColorMixSettings) => void; isHost: boolean }>()

function set<K extends keyof ColorMixSettings>(key: K, value: ColorMixSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}

type ColorCount = ColorMixSettings['colorCount']

const roundItems = [
  { title: 'Unlimited', value: null as number | null },
  ...ROUND_COUNTS.map((n) => ({ title: `${n} rounds`, value: n as number | null })),
]
const colorItems = [
  ...Array.from({ length: MAX_COLORS - MIN_COLORS + 1 }, (_, i) => ({ title: `${MIN_COLORS + i} colours`, value: (MIN_COLORS + i) as ColorCount })),
  { title: 'Random', value: 'random' as ColorCount },
]
const scoringItems = [
  { title: 'Ranked', value: 'ranked' as Scoring },
  { title: 'Closest only', value: 'closest' as Scoring },
]
const timerItems = [
  { title: 'Off', value: null as number | null },
  ...GUESS_TIMERS.map((s) => ({ title: `${s} seconds`, value: s as number | null })),
]
</script>
