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
      :hint="settings.wordSource === 'library' ? 'Uses built-in words if the library runs out' : undefined"
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
  // a library category may not exist in the built-in list (and vice versa)
  props.update({ ...props.settings, wordSource: source, category: null })
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
  { title: 'Word library', value: 'library' },
  { title: 'Built-in list', value: 'builtin' },
]
const guessModes = [
  { title: 'Bonus', value: 'bonus' },
  { title: 'Steal', value: 'steal' },
  { title: 'Off', value: 'off' },
]
const timerItems = [{ title: 'Off', value: null as number | null }, ...[15, 30, 45, 60, 90].map((s) => ({ title: `${s} seconds`, value: s as number | null }))]

const library = ref<{ category: string; total: number }[]>([])
const builtin = ref<string[]>([])
onMounted(async () => {
  try {
    const res = await fetch('/api/games/imposter/categories')
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
    props.settings.wordSource === 'library' && library.value.length > 0
      ? library.value.map((c) => ({ title: `${c.category} (${c.total})`, value: c.category as string | null }))
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
