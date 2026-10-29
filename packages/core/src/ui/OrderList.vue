<template>
  <div class="order-list">
    <div
      v-for="(item, i) in shown"
      :key="item.id"
      :ref="(el) => setRow(item.id, el)"
      class="order-row"
      :class="{ 'order-row--dragging': drag?.id === item.id, 'order-row--settling': drag !== null && drag.id !== item.id }"
      :style="offset(item.id, i)"
    >
      <v-card :variant="drag?.id === item.id ? 'elevated' : 'tonal'" :elevation="drag?.id === item.id ? 8 : 0" class="d-flex align-center">
        <div
          v-if="!disabled"
          class="order-handle d-flex align-center justify-center"
          aria-hidden="true"
          @pointerdown="(e) => start(e, item.id, i)"
          @pointermove="moveTo"
          @pointerup="finish"
          @pointercancel="cancel"
        >
          <v-icon>mdi-drag</v-icon>
        </div>
        <div class="flex-grow-1 py-2" :class="disabled ? 'px-4' : 'pr-1'" style="min-width: 0">
          <slot name="item" :item="item" :index="i" />
        </div>
        <div v-if="!disabled" class="d-flex flex-column pr-1">
          <v-btn
            icon="mdi-chevron-up"
            size="x-small"
            variant="text"
            density="comfortable"
            data-move="up"
            :disabled="i === 0"
            :aria-label="`Move ${labelOf(item, i)} up`"
            @click="commit(item.id, i - 1, 'up')"
          />
          <v-btn
            icon="mdi-chevron-down"
            size="x-small"
            variant="text"
            density="comfortable"
            data-move="down"
            :disabled="i === shown.length - 1"
            :aria-label="`Move ${labelOf(item, i)} down`"
            @click="commit(item.id, i + 1, 'down')"
          />
        </div>
      </v-card>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends { id: string }">
// A vertical list a player reorders by dragging a row's handle (pointer events, so touch works;
// the rest of the row still scrolls the page) or with its up/down buttons. Emits move(id, to);
// the new order shows straight away and gives way to the parent's items when they next change.
// The handle is pointer-only (hidden from screen readers); the buttons are the keyboard way, they
// name their row (`itemLabel`), and each move is announced with the row's new place.
import { computed, nextTick, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { announce } from './announce.ts'

const props = defineProps<{
  items: T[]
  disabled?: boolean
  /** What a row is called in its buttons and announcements, e.g. its clue. Default "item 3". */
  itemLabel?: (item: T) => string
}>()
const emit = defineEmits<{ move: [id: string, to: number] }>()
defineSlots<{ item(props: { item: T; index: number }): unknown }>()

const GAP = 8
const EDGE = 64

// ---- optimistic order: shown until the server's next order arrives (or a rejected move times out)
const pending = ref<string[] | null>(null)
let pendingTimer: ReturnType<typeof setTimeout> | undefined
const shown = computed(() => {
  if (!pending.value) return props.items
  const byId = new Map(props.items.map((it) => [it.id, it]))
  const ordered = pending.value.flatMap((id) => byId.get(id) ?? [])
  return [...ordered, ...props.items.filter((it) => !pending.value!.includes(it.id))]
})
watch(
  () => props.items.map((it) => it.id).join('|'),
  () => (pending.value = null),
)

const labelOf = (item: T, index: number) => props.itemLabel?.(item) ?? `item ${index + 1}`

function commit(id: string, to: number, button?: 'up' | 'down') {
  const ids = shown.value.map((it) => it.id)
  const from = ids.indexOf(id)
  if (from === -1 || to < 0 || to >= ids.length || to === from) return
  ids.splice(from, 1)
  ids.splice(to, 0, id)
  pending.value = ids
  clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => (pending.value = null), 2000)
  emit('move', id, to)
  const item = shown.value[to]!
  announce(`${labelOf(item, to)}, ${to + 1} of ${ids.length}`)
  if (button) void refocus(id, button)
}

// The row moved in the DOM, which can drop focus, and its button may now be disabled (at an end):
// put focus back on the same button, or the row's other one.
async function refocus(id: string, button: 'up' | 'down') {
  await nextTick()
  const row = rows.get(id)
  const pick = (dir: string) => row?.querySelector<HTMLButtonElement>(`[data-move="${dir}"]:not([disabled])`)
  ;(pick(button) ?? pick(button === 'up' ? 'down' : 'up'))?.focus()
}

// ---- dragging
const rows = new Map<string, HTMLElement>()
function setRow(id: string, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) rows.set(id, el)
  else rows.delete(id)
}

interface Drag {
  id: string
  from: number
  to: number
  pointerId: number
  startY: number
  startScroll: number
  clientY: number
  /** window.scrollY as last seen; kept here so the offsets react to auto-scrolling. */
  scrollY: number
  /** Row tops (page coordinates) and heights when the drag started. */
  tops: number[]
  heights: number[]
}
const drag = ref<Drag | null>(null)
let scrollFrame = 0

function start(e: PointerEvent, id: string, index: number) {
  if (props.disabled || drag.value || (e.pointerType === 'mouse' && e.button !== 0)) return
  const rects = shown.value.map((it) => rows.get(it.id)?.getBoundingClientRect())
  if (rects.some((r) => !r)) return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  drag.value = {
    id,
    from: index,
    to: index,
    pointerId: e.pointerId,
    startY: e.clientY,
    startScroll: window.scrollY,
    clientY: e.clientY,
    scrollY: window.scrollY,
    tops: rects.map((r) => r!.top + window.scrollY),
    heights: rects.map((r) => r!.height),
  }
  scrollFrame = requestAnimationFrame(autoScroll)
}

const dy = (d: Drag) => d.clientY - d.startY + d.scrollY - d.startScroll

/** The slot the dragged row's centre is over: how many other rows' centres lie above it. */
function target(d: Drag): number {
  const centre = d.tops[d.from]! + d.heights[d.from]! / 2 + dy(d)
  return d.tops.filter((top, i) => i !== d.from && top + d.heights[i]! / 2 < centre).length
}

function moveTo(e: PointerEvent) {
  const d = drag.value
  if (!d || e.pointerId !== d.pointerId) return
  d.clientY = e.clientY
  d.scrollY = window.scrollY
  d.to = target(d)
}

// Near the top or bottom of the screen, scroll so a long list can be dragged end to end.
function autoScroll() {
  const d = drag.value
  if (!d) return
  const speed = d.clientY < EDGE ? -(EDGE - d.clientY) / 4 : d.clientY > window.innerHeight - EDGE ? (d.clientY - window.innerHeight + EDGE) / 4 : 0
  if (speed !== 0) {
    window.scrollBy(0, speed)
    d.scrollY = window.scrollY
    d.to = target(d)
  }
  scrollFrame = requestAnimationFrame(autoScroll)
}

function finish(e: PointerEvent) {
  const d = drag.value
  if (!d || e.pointerId !== d.pointerId) return
  cancel()
  commit(d.id, d.to)
}

function cancel() {
  cancelAnimationFrame(scrollFrame)
  drag.value = null
}

/** The dragged row follows the pointer; the rows it passes slide over to make room. */
function offset(id: string, index: number): Record<string, string> {
  const d = drag.value
  if (!d) return {}
  if (id === d.id) return { transform: `translateY(${dy(d)}px)` }
  const shift = d.heights[d.from]! + GAP
  if (d.from < d.to && index > d.from && index <= d.to) return { transform: `translateY(${-shift}px)` }
  if (d.to < d.from && index >= d.to && index < d.from) return { transform: `translateY(${shift}px)` }
  return {}
}

onUnmounted(() => {
  cancelAnimationFrame(scrollFrame)
  clearTimeout(pendingTimer)
})
</script>

<style scoped>
.order-list {
  display: flex;
  flex-direction: column;
  gap: 8px; /* GAP */
}
.order-row {
  position: relative;
}
.order-row--dragging {
  z-index: 2;
}
.order-row--settling {
  transition: transform 150ms ease;
}
.order-handle {
  align-self: stretch;
  width: 44px;
  cursor: grab;
  touch-action: none; /* the handle drags; the rest of the row scrolls the page */
  user-select: none;
  -webkit-user-select: none;
}
.order-row--dragging .order-handle {
  cursor: grabbing;
}
</style>
