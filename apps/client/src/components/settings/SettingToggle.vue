<template>
  <div class="mb-3">
    <div class="text-body-2 mb-1">{{ label }}</div>
    <v-btn-toggle
      :model-value="modelValue"
      :disabled="disabled"
      mandatory
      density="comfortable"
      color="primary"
      variant="outlined"
      class="setting-toggle"
      @update:model-value="(v: unknown) => emit('update:modelValue', v)"
    >
      <v-btn v-for="item in items" :key="String(item.value)" :value="item.value" size="small">{{ item.title }}</v-btn>
    </v-btn-toggle>
    <div v-if="hint" class="text-caption text-medium-emphasis mt-1">{{ hint }}</div>
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

<style scoped>
/* Vuetify joins group buttons edge to edge; separate them so they wrap cleanly on phones. */
.setting-toggle {
  flex-wrap: wrap;
  gap: 8px;
  height: auto;
  overflow: visible;
  border-radius: 0;
}
.setting-toggle > .v-btn {
  border: thin solid currentColor;
  border-radius: 4px;
}
</style>
