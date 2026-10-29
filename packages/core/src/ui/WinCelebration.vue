<template>
  <Teleport to="body">
    <canvas v-if="bursting" ref="canvas" class="win-confetti" aria-hidden="true" />
    <Transition name="win-pop">
      <div v-if="showing" class="win-celebration">
        <v-card class="win-celebration__card text-center" elevation="16" rounded="xl" @click="hide">
          <v-card-text class="py-8 px-6 px-sm-10">
            <v-icon v-if="!podium" icon="mdi-trophy" color="amber" size="72" class="mb-2" />
            <div class="text-headline-large font-weight-bold">{{ title }}</div>
            <div v-if="subtitle" class="text-body-large mt-2">{{ subtitle }}</div>

            <div v-if="podium" class="win-podium mt-6">
              <div
                v-for="step in podium"
                :key="step.place"
                class="win-podium__step"
                :class="[`win-podium__step--${step.place}`, { 'win-podium__step--empty': step.players.length === 0 }]"
              >
                <div class="win-podium__names">
                  <div v-for="s in step.players" :key="s.id">
                    <div class="text-body-large font-weight-bold text-truncate">{{ s.name }}</div>
                    <div v-if="s.detail" class="text-body-small text-medium-emphasis">{{ s.detail }}</div>
                  </div>
                </div>
                <div class="win-podium__block">{{ ordinal(step.place) }}</div>
              </div>
            </div>

            <div v-if="rest.length > 0" class="win-rest mt-4 text-left">
              <div v-for="s in rest" :key="s.id" class="d-flex align-center ga-3 py-1">
                <span class="win-rest__place text-medium-emphasis">{{ ordinal(s.place) }}</span>
                <span class="text-body-large flex-grow-1 text-truncate">{{ s.name }}</span>
                <span v-if="s.detail" class="text-body-medium text-medium-emphasis">{{ s.detail }}</span>
              </div>
            </div>
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
// Only the card takes clicks: the page underneath (a New game button) stays usable. Escape closes it
// too, and screen readers hear the result (and placings) through `announce`.
// With `standings` it also shows a podium (2nd, 1st, 3rd from the left; tied players share
// a step) and everyone below 3rd in a list, and stays longer so there's time to read it.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Standing } from '../client.ts'
import { announce } from './announce.ts'
import { ordinal } from './helpers.ts'

const props = withDefaults(
  defineProps<{
    active: boolean
    title: string
    subtitle?: string
    /** Final placings, best first. Without them, or with fewer than 3, it's just the title card. */
    standings?: Standing[]
    /** Confetti colours, e.g. the winner's. */
    colors?: string[]
    /** Wait before firing, e.g. for the winning move's animation to finish. */
    delay?: number
    /** How long the card stays; 3.5s, or 7s with a podium. */
    duration?: number
  }>(),
  { colors: () => ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00'], delay: 0 },
)

// Two players get the plain card: a podium of two says nothing the title doesn't.
// A place nobody holds (2nd after a tie for 1st) keeps its empty step, so 1st stays in the middle.
const podium = computed(() =>
  props.standings && props.standings.length >= 3
    ? [2, 1, 3].map((place) => ({ place, players: props.standings!.filter((s) => s.place === place) }))
    : null,
)
const rest = computed(() => (podium.value ? props.standings!.filter((s) => s.place > 3) : []))

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
  document.addEventListener('keydown', onKey)
  const placings = props.standings && props.standings.length >= 3 ? props.standings.map((s) => `${ordinal(s.place)} ${s.name}`) : []
  announce([props.title, props.subtitle, ...placings].filter(Boolean).join('. '))
  timers.push(setTimeout(hide, props.duration ?? (podium.value ? 7000 : 3500)))
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) void burst()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') hide()
}

function hide() {
  document.removeEventListener('keydown', onKey)
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
  width: 100%;
  max-width: 520px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
}

.win-podium {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: end;
  gap: 8px;
}
.win-podium__step {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
}
.win-podium__step--empty {
  visibility: hidden;
}
.win-podium__names {
  margin-bottom: 6px;
  animation: win-fade 0.3s ease-out both;
}
.win-podium__block {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8px;
  border-radius: 8px 8px 0 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #3e2723;
  transform-origin: bottom;
  animation: win-rise 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
/* 3rd rises first and 1st last, each name appearing once its step is up. */
.win-podium__step--1 .win-podium__block {
  height: 112px;
  background: linear-gradient(#ffe082, #ffb300);
  animation-delay: 0.75s;
}
.win-podium__step--1 .win-podium__names {
  animation-delay: 1.15s;
}
.win-podium__step--2 .win-podium__block {
  height: 80px;
  background: linear-gradient(#f5f5f5, #9e9e9e);
  animation-delay: 0.55s;
}
.win-podium__step--2 .win-podium__names {
  animation-delay: 0.95s;
}
.win-podium__step--3 .win-podium__block {
  height: 56px;
  background: linear-gradient(#ffcc80, #b8732e);
  animation-delay: 0.35s;
}
.win-podium__step--3 .win-podium__names {
  animation-delay: 0.75s;
}
@keyframes win-rise {
  from {
    transform: scaleY(0);
  }
}
@keyframes win-fade {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
.win-rest {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-top: 8px;
}
.win-rest__place {
  min-width: 2.5em;
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
  .win-podium__block,
  .win-podium__names {
    animation: none;
  }
}
</style>
