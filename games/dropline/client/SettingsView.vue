<template>
  <div>
    <SettingToggle
      label="Line length"
      :model-value="settings.lineLength"
      :items="lengthItems"
      :hint="`${settings.lineLength} in a row wins`"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('lineLength', v as LineLength)"
    />
    <SettingToggle
      label="Board size"
      :model-value="settings.boardSize"
      :items="sizeItems"
      :hint="`${dims.cols} columns × ${dims.rows} rows`"
      :disabled="!isHost"
      @update:model-value="(v: unknown) => set('boardSize', v as BoardSize)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { BOARD_DIMENSIONS, BOARD_SIZES, LINE_LENGTHS, type BoardSize, type DropLineSettings, type LineLength } from '../shared/index.ts'

const props = defineProps<{ settings: DropLineSettings; update: (s: DropLineSettings) => void; isHost: boolean }>()

function set<K extends keyof DropLineSettings>(key: K, value: DropLineSettings[K]) {
  props.update({ ...props.settings, [key]: value })
}

const lengthItems = LINE_LENGTHS.map((n) => ({ title: String(n), value: n }))
const sizeItems = computed(() =>
  BOARD_SIZES.map((size) => {
    const { cols, rows } = BOARD_DIMENSIONS[props.settings.lineLength][size]
    return { title: `${size[0]!.toUpperCase()}${size.slice(1)} ${cols}×${rows}`, value: size }
  }),
)
const dims = computed(() => BOARD_DIMENSIONS[props.settings.lineLength][props.settings.boardSize])
</script>
