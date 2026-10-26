<template>
  <v-dialog v-model="open" max-width="640" scrollable>
    <template #activator="{ props: activator }">
      <v-btn v-bind="{ ...activator, ...$attrs }" variant="tonal" :prepend-icon="icon">{{ title }}</v-btn>
    </template>
    <v-card :title="title">
      <v-card-text>
        <slot><MoveLog :entries="entries ?? []" /></slot>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
// A button that opens a game's move list (or other look-back content, via the slot) as a dialog,
// like How to play, so it doesn't push the play view down. Attributes go to the button.
import { ref } from 'vue'
import type { MoveLogEntry } from './helpers.ts'
import MoveLog from './MoveLog.vue'

defineOptions({ inheritAttrs: false })
withDefaults(
  defineProps<{
    title: string
    entries?: MoveLogEntry[]
    icon?: string
  }>(),
  { entries: undefined, icon: 'mdi-format-list-numbered' },
)
const open = ref(false)
</script>
