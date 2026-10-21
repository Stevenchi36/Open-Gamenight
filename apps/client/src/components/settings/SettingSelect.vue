<template>
  <v-select
    :model-value="modelValue"
    :items="items"
    item-title="title"
    item-value="value"
    :label="label"
    :hint="hint"
    :persistent-hint="!!hint"
    :disabled="disabled"
    class="mb-2"
    @update:model-value="(v: unknown) => emit('update:modelValue', v)"
  />
</template>

<script setup lang="ts">
defineProps<{
  label: string
  modelValue: unknown
  items: { title: string; value: unknown }[]
  hint?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()
</script>
