<template>
  <v-dialog v-model="open" max-width="640" scrollable>
    <template #activator="{ props: activator }">
      <v-btn v-bind="activator" variant="tonal" prepend-icon="mdi-help-circle-outline">How to play</v-btn>
    </template>
    <v-card>
      <v-card-text class="rules">
        <v-progress-circular v-if="html === null && !failed" indeterminate color="primary" />
        <div v-else-if="failed">Couldn't load the rules. Check your connection and try again.</div>
        <!-- Trusted: the game's own RULES.md, bundled at build time. -->
        <div v-else v-html="html" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
// The current game's RULES.md as a dialog. Rules and the Markdown renderer load on first open.
import type { GameClientModule } from '@wsfg/core/client'
import { ref, watch } from 'vue'

const props = defineProps<{ game: GameClientModule }>()
const open = ref(false)
const html = ref<string | null>(null)
const failed = ref(false)
let loadedFor: string | null = null

watch([open, () => props.game.id], async ([isOpen, id]) => {
  if (!isOpen || loadedFor === id) return
  loadedFor = id
  html.value = null
  failed.value = false
  try {
    const [markdown, { marked }] = await Promise.all([props.game.rules(), import('marked')])
    html.value = await marked.parse(markdown)
  } catch {
    loadedFor = null
    failed.value = true
  }
})
</script>

<style scoped>
.rules :deep(h1) {
  font-size: 1.5rem;
  margin-bottom: 0.75rem;
}
.rules :deep(h2) {
  font-size: 1.15rem;
  margin: 1.25rem 0 0.5rem;
}
.rules :deep(p),
.rules :deep(ul),
.rules :deep(ol) {
  margin-bottom: 0.75rem;
}
.rules :deep(ul),
.rules :deep(ol) {
  padding-left: 1.5rem;
}
.rules :deep(li) {
  margin-bottom: 0.25rem;
}
</style>
