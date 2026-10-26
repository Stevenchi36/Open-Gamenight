<template>
  <div class="spectator-layout">
    <div ref="box" class="spectator-layout__main">
      <div ref="content" class="spectator-layout__content" :style="scale < 1 ? { transform: `scale(${scale})` } : undefined">
        <slot />
      </div>
    </div>
    <div class="spectator-layout__side">
      <slot name="side" />
    </div>
  </div>
</template>

<script setup lang="ts">
// The watch page's two columns: the game on the left, scores and history on the right. From md
// up the page is exactly one screen tall, so a TV never scrolls: the game shrinks to fit its
// column (a transform, so it keeps its layout and can't loop back into its own measurement) and
// the side column scrolls on its own. Below md the two stack and the page scrolls as usual.
import { onMounted, onUnmounted, ref } from 'vue'

const box = ref<HTMLElement>()
const content = ref<HTMLElement>()
const scale = ref(1)

const wide = window.matchMedia('(min-width: 960px)')
function fit() {
  if (!box.value || !content.value) return
  const natural = content.value.offsetHeight
  scale.value = wide.matches && natural > 0 ? Math.min(1, box.value.clientHeight / natural) : 1
}

const observer = new ResizeObserver(fit)
onMounted(() => {
  observer.observe(box.value!)
  observer.observe(content.value!)
  wide.addEventListener('change', fit)
})
onUnmounted(() => {
  observer.disconnect()
  wide.removeEventListener('change', fit)
})
</script>

<style scoped>
.spectator-layout {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
@media (min-width: 960px) {
  .spectator-layout {
    display: grid;
    grid-template-columns: 2fr 1fr;
    height: 100%;
    min-height: 0;
  }
  .spectator-layout__main {
    min-height: 0;
    overflow: hidden;
  }
  .spectator-layout__content {
    transform-origin: top center;
  }
  /* A little padding so the scrollbar doesn't sit on the cards. */
  .spectator-layout__side {
    min-height: 0;
    overflow-y: auto;
    padding-right: 8px;
  }
}
</style>
