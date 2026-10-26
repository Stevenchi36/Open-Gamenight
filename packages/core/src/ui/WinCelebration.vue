<template>
  <Teleport to="body">
    <canvas v-if="bursting" ref="canvas" class="win-confetti" aria-hidden="true" />
    <Transition name="win-pop">
      <div v-if="showing" class="win-celebration" role="status">
        <v-card class="win-celebration__card text-center" elevation="16" rounded="xl" @click="hide">
          <v-card-text class="py-8 px-10">
            <v-icon icon="mdi-trophy" color="amber" size="72" class="mb-2" />
            <div class="text-h4 font-weight-bold">{{ title }}</div>
            <div v-if="subtitle" class="text-body-1 mt-2">{{ subtitle }}</div>
          </v-card-text>
        </v-card>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// A confetti burst from the middle of the screen with a card that pops out of it, then
// goes by itself (or on a tap). It fires when `active` turns true while on screen, never
// on first render, so joining or reconnecting onto a finished game doesn't replay it.
// Only the card takes clicks: the page underneath (a New game button) stays usable.
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    active: boolean
    title: string
    subtitle?: string
    /** Confetti colours, e.g. the winner's. */
    colors?: string[]
    /** Wait before firing, e.g. for the winning move's animation to finish. */
    delay?: number
    /** How long the card stays. */
    duration?: number
  }>(),
  { colors: () => ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00'], delay: 0, duration: 3500 },
)

const showing = ref(false)
const bursting = ref(false)
const canvas = ref<HTMLCanvasElement | null>(null)
let timers: ReturnType<typeof setTimeout>[] = []
let frame = 0

watch(
  () => props.active,
  (now, before) => {
    if (now && !before) timers.push(setTimeout(fire, props.delay))
    else if (!now) hide()
  },
)
onBeforeUnmount(hide)

function fire() {
  showing.value = true
  timers.push(setTimeout(hide, props.duration))
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) void burst()
}

function hide() {
  timers.forEach(clearTimeout)
  timers = []
  cancelAnimationFrame(frame)
  showing.value = false
  bursting.value = false
}

const LIFE_MS = 2800
const FADE_MS = 700

async function burst() {
  bursting.value = true
  await nextTick()
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return
  const dpr = window.devicePixelRatio || 1
  el.width = window.innerWidth * dpr
  el.height = window.innerHeight * dpr
  // Speeds are per 60fps frame, scaled so the burst fills a phone or a TV alike.
  const scale = (Math.min(el.width, el.height) / 700) * 1.1
  const pieces = Array.from({ length: 180 }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = (4 + Math.random() * 12) * scale
    return {
      x: el.width / 2,
      y: el.height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5 * scale,
      w: (6 + Math.random() * 6) * dpr,
      h: (10 + Math.random() * 8) * dpr,
      spin: Math.random() * Math.PI * 2,
      spinSpeed: (Math.random() - 0.5) * 0.4,
      flutter: Math.random() * Math.PI * 2,
      color: props.colors[Math.floor(Math.random() * props.colors.length)]!,
    }
  })
  const start = performance.now()
  let prev = start
  const step = (t: number) => {
    const f = Math.min((t - prev) / (1000 / 60), 3)
    prev = t
    const age = t - start
    if (age > LIFE_MS) {
      bursting.value = false
      return
    }
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.globalAlpha = Math.min(1, (LIFE_MS - age) / FADE_MS)
    for (const p of pieces) {
      p.vx *= 0.985 ** f
      p.vy = p.vy * 0.985 ** f + 0.3 * scale * f
      p.x += p.vx * f
      p.y += p.vy * f
      p.spin += p.spinSpeed * f
      p.flutter += 0.15 * f
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.spin)
      // Squashing one axis makes the piece look like it's tumbling.
      ctx.scale(1, Math.cos(p.flutter))
      ctx.fillStyle = p.color
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}
</script>

<style scoped>
.win-confetti {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 3000;
}
.win-celebration {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  pointer-events: none;
  z-index: 3001;
}
.win-celebration__card {
  pointer-events: auto;
  max-width: 480px;
}
/* Pops out of the burst with a slight overshoot. */
.win-pop-enter-active {
  transition:
    transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.2s;
}
.win-pop-leave-active {
  transition:
    transform 0.25s ease-in,
    opacity 0.25s;
}
.win-pop-enter-from,
.win-pop-leave-to {
  transform: scale(0.2);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .win-pop-enter-from,
  .win-pop-leave-to {
    transform: none;
  }
}
</style>
