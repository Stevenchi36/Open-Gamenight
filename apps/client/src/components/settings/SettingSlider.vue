<template>
  <div class="mb-2">
    <div class="d-flex justify-space-between text-body-medium">
      <span>{{ label }}</span>
      <span class="font-weight-medium">{{ modelValue }}{{ suffix ?? '' }}</span>
    </div>
    <!-- name: Vuetify names the slider's thumb from it, and from nothing else. -->
    <v-slider
      :model-value="modelValue"
      :name="label"
      :min="min"
      :max="max"
      :step="step ?? 1"
      :disabled="disabled"
      color="primary"
      hide-details
      show-ticks="always"
      tick-size="3"
      density="compact"
      @update:model-value="(v: number) => emit('update:modelValue', v)"
    />
    <div v-if="hint" class="text-body-small text-medium-emphasis">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  modelValue: number
  min: number
  max: number
  step?: number
  suffix?: string
  hint?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>
