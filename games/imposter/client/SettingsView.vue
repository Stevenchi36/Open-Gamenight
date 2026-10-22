<template>
  <div>
    <SettingSlider
      label="Rotations"
      :model-value="settings.rotations"
      :min="1"
      :max="5"
      hint="Clue rounds around the table"
      :disabled="!isHost"
      @update:model-value="(v: number) => set('rotations', v)"
    />
    <SettingToggle
      label="Clue mode"
      :model-value="settings.clueMode"
      :items="clueModes"
      :hint="settings.clueMode === 'spoken' ? 'Players say their clue out loud and tap Done' : 'Players type one word each'"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('clueMode', v as ImposterSettings['clueMode'])"
    />
    <SettingToggle
      label="Imposter gets"
      :model-value="settings.imposterHint"
      :items="hintModes"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('imposterHint', v as ImposterSettings['imposterHint'])"
    />
    <SettingToggle
      label="Words from"
      :model-value="settings.wordSource"
      :items="sources"
      :hint="
        settings.wordSource === 'all'
          ? 'Built-in starter words plus everything added since'
          : 'Skips the built-in starter words (used only if added words run out)'
      "
      :disabled="!isHost"
      @update:model-value="(v: unknown) => setSource(v as ImposterSettings['wordSource'])"
    />
    <SettingSelect
      label="Category"
      :model-value="settings.category"
      :items="categoryItems"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('category', v as string | null)"
    />
    <SettingSelect
      label="Clue timer"
      :model-value="settings.clueTimerSeconds"
      :items="timerItems"
      :hint="timerHint"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('clueTimerSeconds', v as number | null)"
    />
    <SettingToggle
      label="Imposter's guess"
      :model-value="settings.guessMode"
      :items="guessModes"
      :hint="guessHint"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('guessMode', v as ImposterSettings['guessMode'])"
    />
    <v-expansion-panels variant="accordion" class="mt-2">
      <v-expansion-panel title="Points">
        <v-expansion-panel-text>
          <SettingSlider
            label="Crew catches the imposter"
            :model-value="settings.catchPoints"
            :min="0"
            :max="3"
            suffix=" each"
            :disabled="!isHost"
            @update:model-value="(v: number) => set('catchPoints', v)"
          />
          <SettingSlider
            label="Imposter escapes"
            :model-value="settings.escapePoints"
            :min="0"
            :max="5"
            :disabled="!isHost"
            @update:model-value="(v: number) => set('escapePoints', v)"
          />
          <SettingSlider
            v-if="settings.guessMode === 'bonus'"
            label="Correct guess bonus"
            :model-value="settings.guessPoints"
            :min="0"
            :max="3"
            :disabled="!isHost"
            @update:model-value="(v: number) => set('guessPoints', v)"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ImposterSettings } from '../shared/index.ts'

const props = defineProps<{ settings: ImposterSettings; update: (s: ImposterSettings) => void; isHost: boolean }>()

function set<K extends keyof ImposterSettings>(key: K, value: ImposterSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}
function setSource(source: ImposterSettings['wordSource']) {
  // keep the category unless it has no added words
  const current = library.value.find((c) => c.category === props.settings.category)
  const category = source === 'custom' && current && current.custom === 0 ? null : props.settings.category
  props.update({ ...props.settings, wordSource: source, category })
}

const clueModes = [
  { title: 'Typed', value: 'typed' },
  { title: 'Spoken', value: 'spoken' },
]
const hintModes = [
  { title: 'Nothing', value: 'none' },
  { title: 'Category', value: 'category' },
  { title: 'Category + hint', value: 'category+hint' },
]
const sources = [
  { title: 'All words', value: 'all' },
  { title: 'Added only', value: 'custom' },
]
const guessModes = [
  { title: 'Bonus', value: 'bonus' },
  { title: 'Steal', value: 'steal' },
  { title: 'Off', value: 'off' },
]
const timerItems = [{ title: 'Off', value: null as number | null }, ...[15, 30, 45, 60, 90].map((s) => ({ title: `${s} seconds`, value: s as number | null }))]

const library = ref<{ category: string; total: number; custom: number }[]>([])
const builtin = ref<string[]>([])
onMounted(async () => {
  try {
    const res = await fetch('/api/games/imposter/categories')
    if (res.ok) {
      const data = (await res.json()) as { library: { category: string; total: number; custom: number }[]; builtin: string[] }
      library.value = data.library
      builtin.value = data.builtin
    }
  } catch {
    // keep "Any" only
  }
})

const categoryItems = computed(() => {
  const withCount = (key: 'total' | 'custom') =>
    library.value.map((c) => ({ category: c.category, count: c[key] })).filter((c) => c.count > 0)
  // with no added words yet, "Added only" plays the starter words anyway
  const customOnly = props.settings.wordSource === 'custom' ? withCount('custom') : []
  const available = customOnly.length > 0 ? customOnly : withCount('total')
  const names =
    available.length > 0
      ? available.map((c) => ({ title: `${c.category} (${c.count})`, value: c.category as string | null }))
      : builtin.value.map((c) => ({ title: c, value: c as string | null }))
  const current = props.settings.category
  if (current && !names.some((n) => n.value === current)) names.push({ title: current, value: current })
  return [{ title: 'Any category', value: null as string | null }, ...names]
})

const timerHint = computed(() => {
  if (!props.settings.clueTimerSeconds) return undefined
  return props.settings.clueMode === 'typed' ? 'Turns are skipped when time runs out' : 'Countdown only; never cuts off a speaker'
})

const guessHint = computed(
  () =>
    ({
      bonus: 'After the vote, the imposter guesses the word for bonus points',
      steal: 'A caught imposter can still win by guessing the word',
      off: 'No guessing',
    })[props.settings.guessMode],
)
</script>
