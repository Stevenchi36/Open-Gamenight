<template>
  <!-- On the page from the start: screen readers ignore a live region that arrives already filled. -->
  <div class="d-sr-only" aria-live="polite" aria-atomic="true">{{ liveMessage }}</div>
</template>

<script setup lang="ts">
// Where `announce()` speaks. Mounted once, by the client shell.
import { liveMessage } from './announce.ts'
</script>
