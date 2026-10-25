<template>
  <div>
    <SettingSelect
      label="Rounds"
      :model-value="settings.rounds"
      :items="roundItems"
      :hint="settings.rounds === null ? 'Play until the team runs out of lives' : 'Clear them all to win'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('rounds', v as number | null)"
    />
    <SettingSlider
      label="Lives"
      :model-value="settings.lives"
      :min="1"
      :max="MAX_LIVES"
      hint="Shared by the team: each card out of place costs one"
      :disabled="!isHost"
      @update:model-value="(v: number) => set('lives', v)"
    />
    <SettingToggle
      label="Numbers each"
      :model-value="settings.numbersEach"
      :items="eachItems"
      :hint="settings.numbersEach === 1 ? 'One number and one clue per player' : 'More cards in the line: good for small groups'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('numbersEach', v as number)"
    />
    <SettingToggle
      label="Themes from"
      :model-value="settings.themeSource"
      :items="sources"
      :hint="sourceHint"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('themeSource', v as InOrderSettings['themeSource'])"
    />
    <SettingSelect
      label="Category"
      :model-value="settings.category"
      :items="categoryItems"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('category', v as string | null)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MAX_LIVES, MAX_NUMBERS_EACH, ROUND_OPTIONS, type InOrderSettings } from '../shared/index.ts'

const props = defineProps<{ settings: InOrderSettings; update: (s: InOrderSettings) => void; isHost: boolean }>()

function set<K extends keyof InOrderSettings>(key: K, value: InOrderSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}

const roundItems = [
  ...ROUND_OPTIONS.map((n) => ({ title: `${n} rounds`, value: n as number | null })),
  { title: 'Until out of lives', value: null as number | null },
]
const eachItems = Array.from({ length: MAX_NUMBERS_EACH }, (_, i) => ({ title: String(i + 1), value: i + 1 }))

const sources = [
  { title: 'All', value: 'all' },
  { title: 'Recent', value: 'recent' },
]
const sourceHint = computed(() => {
  if (props.settings.themeSource === 'all') return 'Least-played themes first'
  const r = recent.value
  return r ? `The latest batch added first (${r.unused} of ${r.total} unplayed), then older themes` : 'The most recently added themes first'
})

const library = ref<{ category: string; total: number }[]>([])
const recent = ref<{ total: number; unused: number } | null>(null)
const builtin = ref<string[]>([])
onMounted(async () => {
  try {
    const res = await fetch('/api/games/inorder/categories')
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
