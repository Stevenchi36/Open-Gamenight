<template>
  <div class="mb-3">
    <div class="text-body-medium mb-1">{{ label }}</div>
    <v-btn-toggle
      :model-value="modelValue"
      :disabled="disabled"
      mandatory
      border
      divided
      density="comfortable"
      color="primary"
      variant="text"
      class="border-opacity-50"
      @update:model-value="(v: unknown) => emit('update:modelValue', v)"
    >
      <v-btn v-for="item in items" :key="String(item.value)" :value="item.value" size="small">{{ item.title }}</v-btn>
    </v-btn-toggle>
    <div v-if="hint" class="text-body-small text-medium-emphasis mt-1">{{ hint }}</div>
  </div>
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
