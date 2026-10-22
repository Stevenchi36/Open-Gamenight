<template>
  <v-alert v-if="you.role === 'waiting'" type="info" variant="tonal" class="mb-4">
    You joined during this round. You'll get a word when the next round starts.
  </v-alert>
  <HoldToReveal v-else label="Hold to see your word" class="mb-4">
    <!-- Crew and imposter cards look the same from across the table. -->
    <template v-if="you.role === 'crew'">
      <div class="text-overline">Your word</div>
      <div class="text-h4 font-weight-bold mb-1">{{ you.word }}</div>
      <div class="text-body-2">Category: {{ you.category }}</div>
    </template>
    <template v-else>
      <div class="text-overline">You are</div>
      <div class="text-h4 font-weight-bold mb-1">the imposter</div>
      <div v-if="you.category" class="text-body-2">Category: {{ you.category }}</div>
      <div v-if="you.hint" class="text-body-2">Hint: {{ you.hint }}</div>
      <div class="text-caption mt-1">Blend in. Don't get caught.</div>
    </template>
  </HoldToReveal>
</template>

<script setup lang="ts">
import { HoldToReveal } from '@wsfg/core/ui'
import type { ImposterView } from '../shared/index.ts'

defineProps<{ you: ImposterView['you'] }>()
</script>
