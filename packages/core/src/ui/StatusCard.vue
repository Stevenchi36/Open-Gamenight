<template>
  <v-card :color="color" :variant="variant" class="mb-4 text-center">
    <v-card-text :class="prominent ? 'py-8' : 'py-6'">
      <div v-if="overline || $slots.overline" class="text-overline">
        <slot name="overline">{{ overline }}</slot>
      </div>
      <div v-if="title || $slots.title" :class="[compact ? 'text-h5' : 'text-h4', 'font-weight-bold', { 'mb-2': $slots.default }]">
        <slot name="title">{{ title }}</slot>
      </div>
      <div v-if="$slots.default" class="text-body-1"><slot /></div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
// The big centred "what's happening" card: an overline, a headline and a line of detail,
// readable from across the table.
withDefaults(
  defineProps<{
    color?: string
    variant?: 'tonal' | 'flat'
    overline?: string
    title?: string
    /** Extra padding, for the card that is the whole screen's focus. */
    prominent?: boolean
    /** A smaller headline, for longer text. */
    compact?: boolean
  }>(),
  { variant: 'tonal' },
)
</script>
