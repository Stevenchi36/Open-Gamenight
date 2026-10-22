<template>
  <v-form class="d-flex ga-2" @submit.prevent="submit">
    <v-text-field
      v-model="text"
      :label="label"
      :maxlength="maxlength"
      autofocus
      autocomplete="off"
      autocapitalize="off"
      hide-details="auto"
      :error-messages="error"
      :bg-color="onColor ? 'surface' : undefined"
    />
    <v-btn
      type="submit"
      :color="onColor ? 'surface' : 'primary'"
      size="large"
      :disabled="!text.trim()"
      icon="mdi-send"
      :aria-label="sendLabel"
    />
  </v-form>
</template>

<script setup lang="ts">
// A short text answer (a clue, a guess) with a send button. Emits the trimmed text;
// the parent validates and clears the v-model if it wants to.
defineProps<{
  label: string
  maxlength: number
  sendLabel: string
  error?: string
  /** Sitting on a coloured card: give the field and button the surface colour. */
  onColor?: boolean
}>()
const emit = defineEmits<{ submit: [text: string] }>()
const text = defineModel<string>({ default: '' })

function submit() {
  const value = text.value.trim()
  if (value) emit('submit', value)
}
</script>
