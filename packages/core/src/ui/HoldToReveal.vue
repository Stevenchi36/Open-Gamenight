<template>
  <div>
    <v-card
      class="hold-to-reveal"
      :color="revealed ? 'primary' : undefined"
      :variant="revealed ? 'flat' : 'tonal'"
      role="button"
      tabindex="0"
      :aria-pressed="revealed"
      :aria-label="label"
      style="min-height: 150px; cursor: pointer"
      @pointerdown.prevent="show"
      @pointerup="hide"
      @pointerleave="hide"
      @pointercancel="hide"
      @contextmenu.prevent
      @keydown.space.prevent="show"
      @keyup.space="hide"
      @keydown.enter.prevent="(e: KeyboardEvent) => !e.repeat && toggle()"
      @click="(e: MouseEvent) => e.detail === 0 && toggle()"
      @blur="hide"
    >
      <v-card-text class="text-center d-flex flex-column justify-center" style="min-height: 150px">
        <div v-if="revealed"><slot /></div>
        <div v-else>
          <v-icon size="36" class="mb-2">mdi-gesture-tap-hold</v-icon>
          <div class="text-title-large">{{ label }}</div>
          <div class="text-body-small text-medium-emphasis">Keep your screen away from others</div>
        </div>
      </v-card-text>
    </v-card>
    <!-- The card's name stays the label, which hides its content, so screen readers hear the secret here. -->
    <div class="d-sr-only" aria-live="polite">
      <slot v-if="revealed" />
    </div>
  </div>
</template>

<script setup lang="ts">
// The secret is never on screen at rest: it shows only while pressed (pointer, or Space held).
// Enter, and a screen reader's activate (a click with no pointer, detail 0), toggle it instead,
// since neither can hold; it hides again on the next one, on blur, or when the page is hidden.
import { onMounted, onUnmounted, ref } from 'vue'

withDefaults(defineProps<{ label?: string }>(), { label: 'Hold to reveal' })
const revealed = ref(false)
const show = () => (revealed.value = true)
const hide = () => (revealed.value = false)
const toggle = () => (revealed.value = !revealed.value)
const onVisibility = () => {
  if (document.hidden) hide()
}
onMounted(() => document.addEventListener('visibilitychange', onVisibility))
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibility))
</script>

<style scoped>
/* Long-press must not select text or open the callout menu over the secret. */
.hold-to-reveal {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: manipulation;
}
</style>
