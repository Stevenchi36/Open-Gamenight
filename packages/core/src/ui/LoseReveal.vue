<template>
  <Teleport to="body">
    <Transition name="lose-dim">
      <div v-if="showing" class="lose-dim" aria-hidden="true" />
    </Transition>
    <Transition name="lose-pop">
      <div v-if="showing" class="lose-reveal" role="status">
        <v-card class="lose-reveal__card text-center" elevation="16" rounded="xl" @click="hide">
          <v-card-text class="py-6 px-6 px-sm-10">
            <div class="lose-reveal__stage">
              <div v-if="$slots.default" class="lose-reveal__flip">
                <div class="lose-reveal__side lose-reveal__front"><slot /></div>
                <PlayingCard size="lg" class="lose-reveal__side lose-reveal__back" />
              </div>
              <v-icon v-else icon="mdi-emoticon-sad-outline" size="72" class="text-medium-emphasis" />
            </div>
            <div class="lose-reveal__cloud" aria-hidden="true">
              <svg viewBox="0 0 64 28" width="88" height="38">
                <path
                  d="M14 26h38a10 10 0 0 0 1-20 13 13 0 0 0-24-3 9 9 0 0 0-15 7 8 8 0 0 0 0 16z"
                  fill="currentColor"
                />
              </svg>
              <span v-for="i in 5" :key="i" class="lose-reveal__drop" :style="{ '--drop-i': i }" />
            </div>
            <div class="text-headline-large font-weight-bold">{{ title }}</div>
            <div v-if="subtitle" class="text-body-large text-medium-emphasis mt-2">{{ subtitle }}</div>
          </v-card-text>
        </v-card>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// The opposite of WinCelebration, for a game about who got caught (Old Maid): the screen greys
// over, the losing card (the default slot) drops in and turns face up, and a small rain cloud
// rains on the name. Like WinCelebration it fires when `active` turns true while on screen, never
// on first render, goes by itself or on a tap, and only the card takes clicks.
import { onBeforeUnmount, ref, watch } from 'vue'
import PlayingCard from './PlayingCard.vue'

const props = withDefaults(
  defineProps<{
    active: boolean
    title: string
    subtitle?: string
    /** Wait before showing, e.g. for the last move's animation to finish. */
    delay?: number
    /** How long the card stays. */
    duration?: number
  }>(),
  { delay: 0, duration: 5000 },
)

const showing = ref(false)
let timers: ReturnType<typeof setTimeout>[] = []

watch(
  () => props.active,
  (now, before) => {
    if (now && !before) timers.push(setTimeout(show, props.delay))
    else if (!now) hide()
  },
)
onBeforeUnmount(hide)

function show() {
  showing.value = true
  timers.push(setTimeout(hide, props.duration))
}

function hide() {
  timers.forEach(clearTimeout)
  timers = []
  showing.value = false
}
</script>

<style scoped>
.lose-dim {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 3000;
  background: rgba(30, 30, 36, 0.45);
  backdrop-filter: grayscale(0.9);
}
.lose-reveal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  pointer-events: none;
  z-index: 3001;
}
.lose-reveal__card {
  pointer-events: auto;
  width: 100%;
  max-width: 440px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
}

.lose-reveal__stage {
  display: flex;
  justify-content: center;
  height: 100px;
  perspective: 600px;
}
/* The card drops in face down, turns over, then sags a little. */
.lose-reveal__flip {
  position: relative;
  width: 64px;
  height: 92px;
  transform-style: preserve-3d;
  animation: lose-card 2.1s ease-in-out both;
}
.lose-reveal__side {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
}
.lose-reveal__back {
  transform: rotateY(180deg);
}
/* A face-up card in the slot fills the spot whatever size it's drawn at. */
.lose-reveal__front {
  display: flex;
  align-items: center;
  justify-content: center;
}
/* One track, since separate animations of `transform` would override each other. */
@keyframes lose-card {
  0% {
    transform: translateY(-120px) rotateY(180deg) rotate(0deg);
    opacity: 0;
  }
  24% {
    transform: translateY(0) rotateY(180deg) rotate(0deg);
    opacity: 1;
  }
  29% {
    transform: translateY(0) rotateY(180deg) rotate(0deg);
  }
  57% {
    transform: translateY(0) rotateY(0deg) rotate(0deg);
  }
  62% {
    transform: translateY(0) rotateY(0deg) rotate(0deg);
  }
  100% {
    transform: translateY(4px) rotateY(0deg) rotate(-8deg);
  }
}

.lose-reveal__cloud {
  position: relative;
  width: 88px;
  height: 58px;
  margin: 8px auto 0;
  color: rgba(var(--v-theme-on-surface), 0.45);
  animation: lose-fade 0.4s ease-out 1.2s both;
}
.lose-reveal__drop {
  position: absolute;
  top: 34px;
  left: calc(14px + var(--drop-i) * 11px);
  width: 2px;
  height: 9px;
  border-radius: 1px;
  background: rgb(var(--v-theme-info));
  opacity: 0;
  animation: lose-rain 0.9s linear calc(1.3s + var(--drop-i) * 0.17s) infinite;
}
@keyframes lose-rain {
  0% {
    transform: translateY(0);
    opacity: 0;
  }
  20% {
    opacity: 0.9;
  }
  100% {
    transform: translateY(18px);
    opacity: 0;
  }
}
@keyframes lose-fade {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}

.lose-dim-enter-active,
.lose-dim-leave-active {
  transition: opacity 0.6s;
}
.lose-dim-enter-from,
.lose-dim-leave-to {
  opacity: 0;
}
.lose-pop-enter-active {
  transition:
    opacity 0.3s,
    transform 0.4s ease-out;
}
.lose-pop-leave-active {
  transition: opacity 0.3s;
}
.lose-pop-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.lose-pop-leave-to {
  opacity: 0;
}

/* Still: the card face up, the cloud without rain. */
@media (prefers-reduced-motion: reduce) {
  .lose-reveal__flip,
  .lose-reveal__cloud {
    animation: none;
  }
  .lose-reveal__drop {
    display: none;
  }
  .lose-pop-enter-active,
  .lose-dim-enter-active {
    transition: none;
  }
}
</style>
