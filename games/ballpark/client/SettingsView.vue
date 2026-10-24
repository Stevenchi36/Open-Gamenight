<template>
  <div>
    <SettingSelect
      label="Rounds"
      :model-value="settings.rounds"
      :items="roundItems"
      :hint="settings.rounds === null ? 'Play as many questions as you like' : 'The highest score after the last round wins'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('rounds', v as number | null)"
    />
    <SettingToggle
      label="Units"
      :model-value="settings.units"
      :items="unitItems"
      :hint="settings.units === 'imperial' ? 'Feet, miles, pounds, gallons, °F' : 'Metres, kilometres, kilograms, litres, °C'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('units', v as UnitSystem)"
    />
    <SettingToggle
      label="Win rule"
      :model-value="settings.winRule"
      :items="winRuleItems"
      :hint="
        settings.winRule === 'over'
          ? 'The highest guess that isn\'t above the answer wins, or All too high'
          : 'The guess nearest the answer wins, above or below'
      "
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('winRule', v as WinRule)"
    />
    <SettingSelect
      label="Scoring"
      :model-value="settings.scoring"
      :items="scoringItems"
      :hint="scoringHint"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('scoring', v as Scoring)"
    />
    <SettingToggle
      label="Bets"
      :model-value="settings.bets"
      :items="betItems"
      :hint="settings.bets === 'hidden' ? 'Nobody sees where others bet until the answer' : 'Everyone sees tokens as they land'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('bets', v as BetVisibility)"
    />
    <SettingToggle
      label="Questions from"
      :model-value="settings.questionSource"
      :items="sources"
      :hint="sourceHint"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('questionSource', v as BallparkSettings['questionSource'])"
    />
    <SettingSelect
      label="Category"
      :model-value="settings.category"
      :items="categoryItems"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('category', v as string | null)"
    />
    <SettingSelect
      label="Timer"
      :model-value="settings.timerSeconds"
      :items="timerItems"
      :hint="settings.timerSeconds ? 'For guessing, then again for betting; the game moves on when it runs out' : undefined"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('timerSeconds', v as number | null)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  GUESS_BONUS,
  ROUND_COUNTS,
  TIMERS,
  type BallparkSettings,
  type BetVisibility,
  type Scoring,
  type UnitSystem,
  type WinRule,
} from '../shared/index.ts'

const props = defineProps<{ settings: BallparkSettings; update: (s: BallparkSettings) => void; isHost: boolean }>()

function set<K extends keyof BallparkSettings>(key: K, value: BallparkSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}

const roundItems = [
  { title: 'Unlimited', value: null as number | null },
  ...ROUND_COUNTS.map((n) => ({ title: `${n} questions`, value: n as number | null })),
]
const unitItems = [
  { title: 'Metric', value: 'metric' as UnitSystem },
  { title: 'Imperial', value: 'imperial' as UnitSystem },
]
const winRuleItems = [
  { title: 'Without going over', value: 'over' as WinRule },
  { title: 'Closest', value: 'closest' as WinRule },
]
const scoringItems = [
  { title: 'Odds', value: 'odds' as Scoring },
  { title: 'Chips', value: 'chips' as Scoring },
  { title: 'Flat', value: 'flat' as Scoring },
]
const betItems = [
  { title: 'Hidden', value: 'hidden' as BetVisibility },
  { title: 'Public', value: 'public' as BetVisibility },
]
const timerItems = [
  { title: 'Off', value: null as number | null },
  ...TIMERS.map((s) => ({ title: `${s} seconds`, value: s as number | null })),
]

const SCORING_HINTS: Record<Scoring, string> = {
  odds: `Winning tokens pay their guess's odds (2 to 6); writing the winning guess scores ${GUESS_BONUS}`,
  chips: 'Like odds, and you can stake chips from your score on each token to win more, or lose them',
  flat: '1 point per winning token, 1 for writing the winning guess',
}
const scoringHint = computed(() => SCORING_HINTS[props.settings.scoring])

const sources = [
  { title: 'All', value: 'all' },
  { title: 'Recent', value: 'recent' },
]
const sourceHint = computed(() => {
  if (props.settings.questionSource === 'all') return 'Least-played questions first'
  const r = recent.value
  return r
    ? `The latest batch added first (${r.unused} of ${r.total} unplayed), then older questions`
    : 'The most recently added questions first'
})

const library = ref<{ category: string; total: number }[]>([])
const recent = ref<{ total: number; unused: number } | null>(null)
const builtin = ref<string[]>([])
onMounted(async () => {
  try {
    const res = await fetch('/api/games/ballpark/categories')
    if (res.ok) {
      const data = (await res.json()) as {
        library: { category: string; total: number }[]
        recent: { total: number; unused: number } | null
        builtin: string[]
      }
      library.value = data.library
      recent.value = data.recent
      builtin.value = data.builtin
    }
  } catch {
    // keep "Any" only
  }
})

const categoryItems = computed(() => {
  const names =
    library.value.length > 0
      ? library.value.map((c) => ({ title: `${c.category} (${c.total})`, value: c.category as string | null }))
      : builtin.value.map((c) => ({ title: c, value: c as string | null }))
  const current = props.settings.category
  if (current && !names.some((n) => n.value === current)) names.push({ title: current, value: current })
  return [{ title: 'Any category', value: null as string | null }, ...names]
})
</script>
