<template>
  <div>
    <SettingSelect
      label="Score limit"
      :model-value="settings.scoreLimit"
      :items="limitItems"
      :hint="settings.scoreLimit === null ? 'Play as many questions as you like' : 'The first to reach it wins'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('scoreLimit', v as number | null)"
    />
    <SettingToggle
      label="Black sheep"
      :model-value="settings.blackSheep"
      :items="onOff"
      :hint="settings.blackSheep ? 'The only odd one out becomes the black sheep, who can\'t win' : 'No black sheep'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('blackSheep', v as boolean)"
    />
    <SettingToggle
      label="Check matches"
      :model-value="settings.checkMatches"
      :items="onOff"
      :hint="settings.checkMatches ? 'The host merges near-misses like Coco Pops and Cocoa Pops before scoring' : 'Score straight away, matching spelling only'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('checkMatches', v as boolean)"
    />
    <SettingSelect
      label="Category"
      :model-value="settings.category"
      :items="categoryItems"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('category', v as string | null)"
    />
    <SettingSelect
      label="Answer timer"
      :model-value="settings.answerTimerSeconds"
      :items="timerItems"
      :hint="settings.answerTimerSeconds ? 'Answers are revealed when time runs out' : undefined"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('answerTimerSeconds', v as number | null)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ANSWER_TIMERS, SCORE_LIMITS, type FlockSettings } from '../shared/index.ts'

const props = defineProps<{ settings: FlockSettings; update: (s: FlockSettings) => void; isHost: boolean }>()

function set<K extends keyof FlockSettings>(key: K, value: FlockSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}

const onOff = [
  { title: 'On', value: true },
  { title: 'Off', value: false },
]
const limitItems = [
  { title: 'Unlimited', value: null as number | null },
  ...SCORE_LIMITS.map((n) => ({ title: `First to ${n}`, value: n as number | null })),
]
const timerItems = [
  { title: 'Off', value: null as number | null },
  ...ANSWER_TIMERS.map((s) => ({ title: `${s} seconds`, value: s as number | null })),
]

const library = ref<{ category: string; total: number }[]>([])
const builtin = ref<string[]>([])
onMounted(async () => {
  try {
    const res = await fetch('/api/games/flock/categories')
    if (res.ok) {
      const data = (await res.json()) as { library: { category: string; total: number }[]; builtin: string[] }
      library.value = data.library
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
