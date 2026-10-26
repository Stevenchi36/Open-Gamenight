<template>
  <ol class="move-log" :class="{ 'move-log--large': large }">
    <li v-for="e in entries" :key="e.n" class="move-log__row" :class="e.tone ? `move-log__row--${e.tone}` : undefined">
      <span class="move-log__n">{{ e.n }}</span>
      <span class="move-log__text">{{ e.text }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
// A game's moves as a numbered list, each tinted by how it went for the player who made it:
// green when it paid off, red when it didn't, plain when it was neither.
import type { MoveLogEntry } from './helpers.ts'

defineProps<{
  /** In the order to show, usually newest first. */
  entries: MoveLogEntry[]
  /** TV size. */
  large?: boolean
}>()
</script>

<style scoped>
.move-log {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.move-log__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 8px;
  border-left: 4px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 4px;
  font-size: 0.875rem;
}
.move-log--large .move-log__row {
  padding: 6px 10px;
  font-size: 1rem;
}
.move-log__row--success {
  border-left-color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.1);
}
.move-log__row--error {
  border-left-color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.1);
}
.move-log__n {
  flex: none;
  min-width: 1.6em;
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}
</style>
