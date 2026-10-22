<template>
  <div class="attention-glow" aria-hidden="true" />
</template>

<style scoped>
/* Wordless "your move" cue: a pulsing glow around the screen edge, visible from across the table. */
.attention-glow {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1500; /* above the app bar (1004), below dialogs and toasts (2000+) */
  box-shadow: inset 0 0 0 4px rgb(var(--v-theme-primary)), inset 0 0 40px 8px rgba(var(--v-theme-primary), 0.6);
  animation: attention-pulse 1.4s ease-in-out infinite;
}

@keyframes attention-pulse {
  50% {
    opacity: 0.25;
  }
}

@media (prefers-reduced-motion: reduce) {
  .attention-glow {
    animation: none;
  }
}
</style>
