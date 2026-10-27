<template>
  <v-alert v-if="you.role === 'waiting'" type="info" variant="tonal" class="mb-4">
    You joined during this round. You'll get a word when the next round starts.
  </v-alert>
  <HoldToReveal v-else label="Hold to see your word" class="mb-4">
    <!-- Crew and imposter cards look the same from across the table. -->
    <template v-if="you.role === 'crew'">
      <div class="text-label-large">Your word</div>
      <div class="text-headline-large font-weight-bold mb-1">{{ you.word }}</div>
      <div class="text-body-medium">Category: {{ you.category }}</div>
    </template>
    <template v-else>
      <div class="text-label-large">You are</div>
      <div class="text-headline-large font-weight-bold mb-1">the imposter</div>
      <div v-if="you.category" class="text-body-medium">Category: {{ you.category }}</div>
      <div v-if="you.hint" class="text-body-medium">Hint: {{ you.hint }}</div>
      <div class="text-body-small mt-1">Blend in. Don't get caught.</div>
    </template>
  </HoldToReveal>
</template>

<script setup lang="ts">
import { HoldToReveal } from '@ogn/core/ui'
import type { ImposterView } from '../shared/index.ts'

defineProps<{ you: ImposterView['you'] }>()
</script>
