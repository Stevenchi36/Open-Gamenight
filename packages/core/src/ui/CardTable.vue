<template>
  <div class="card-table-wrap">
    <div v-if="!props.layout" class="d-flex justify-end mb-1">
      <v-btn-toggle :model-value="layout" density="compact" variant="outlined" divided mandatory aria-label="Layout" @update:model-value="setLayout">
        <v-btn value="table" size="small" prepend-icon="mdi-circle-outline">Table</v-btn>
        <v-btn value="list" size="small" prepend-icon="mdi-format-list-bulleted">List</v-btn>
      </v-btn-toggle>
    </div>

    <div v-if="layout === 'table'" ref="root" class="card-table">
      <div ref="center" class="card-table__felt">
        <slot name="center" />
      </div>
      <component
        :is="isTappable(seat.id) ? 'button' : 'div'"
        v-for="seat in placed"
        :key="seat.id"
        :ref="(el: unknown) => setSeatEl(seat.id, el)"
        :type="isTappable(seat.id) ? 'button' : undefined"
        class="card-table__seat"
        :class="seatClasses(seat.id)"
        :style="{ left: `${seat.x}%`, top: `${seat.y}%` }"
        :aria-pressed="isTappable(seat.id) ? seat.id === selected : undefined"
        @click="isTappable(seat.id) && emit('select', seat.id)"
      >
        <div class="card-table__name">
          <v-icon v-if="!isConnected(room, seat.id) && !dimmed.includes(seat.id)" size="x-small" class="mr-1">mdi-wifi-off</v-icon>
          <span class="text-truncate">{{ seat.id === me ? 'You' : nameOf(room, seat.id) }}</span>
        </div>
        <slot name="seat" :id="seat.id" />
      </component>
    </div>

    <div v-else ref="root" class="card-list">
      <div ref="center" class="card-list__center"><slot name="center" /></div>
      <component
        :is="isTappable(id) ? 'button' : 'div'"
        v-for="id in listed"
        :key="id"
        :ref="(el: unknown) => setSeatEl(id, el)"
        :type="isTappable(id) ? 'button' : undefined"
        class="card-table__seat card-list__row"
        :class="seatClasses(id)"
        :aria-pressed="isTappable(id) ? id === selected : undefined"
        @click="isTappable(id) && emit('select', id)"
      >
        <div class="card-table__name card-list__name">
          <v-icon v-if="!isConnected(room, id) && !dimmed.includes(id)" size="x-small" class="mr-1">mdi-wifi-off</v-icon>
          <span class="text-truncate">{{ id === me ? 'You' : nameOf(room, id) }}</span>
        </div>
        <div class="card-list__content"><slot name="seat" :id="id" /></div>
      </component>
    </div>

    <!-- On the page, not in the table, so cards flying to your hand aren't clipped by a parent. -->
    <Teleport to="body">
      <div v-if="flying.length > 0" class="card-flights" aria-hidden="true">
        <div v-for="f in flying" :key="f.key" :ref="(el: unknown) => setFlightEl(f.key, el)" class="card-flight">
          <div v-if="f.face !== null" class="card-flight__side">
            <slot name="flight" :face="f.face"><PlayingCard :card="f.face as Card" /></slot>
          </div>
          <PlayingCard v-if="f.face === null || f.flip" class="card-flight__side" :class="{ 'card-flight__back': f.flip }" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
// Players round an oval table in seat order, clockwise, turned so the viewer sits at the bottom;
// or, by each player's choice, a plain list in seat order. The game fills each seat (`seat` slot)
// and the middle (`center`); seats in `tappable` can be picked. `flights` animate cards moving
// between seats, the middle and your hand (see flights.ts); faces fly through the `flight` slot.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PlayerId } from '../contract.ts'
import type { Card } from '../kit.ts'
import { SPECTATOR_ID, type RoomView } from '../protocol.ts'
import { type CardFlight, FLIGHT_MS, MAX_FLIGHT_CARDS, reducedMotion } from './flights.ts'
import { isConnected, nameOf } from './helpers.ts'
import PlayingCard from './PlayingCard.vue'
import { load, save } from './storage.ts'

type Layout = 'table' | 'list'

const props = withDefaults(
  defineProps<{
    room: RoomView
    /** Seat order; turns go this way. */
    seats: PlayerId[]
    /** The viewer; when not seated, the first seat goes at the bottom. */
    me: PlayerId
    turn?: PlayerId | null
    /** Seats the viewer may pick. */
    tappable?: PlayerId[]
    selected?: PlayerId | null
    /** Seats shown faded (players who left). */
    dimmed?: PlayerId[]
    /** Fixes the layout and hides the toggle (a spectator view's TV table). */
    layout?: Layout | null
    /** Cards moving; each new id animates once. */
    flights?: CardFlight[]
  }>(),
  { turn: null, tappable: () => [], selected: null, dimmed: () => [], layout: null, flights: () => [] },
)
const emit = defineEmits<{ select: [id: PlayerId] }>()

const LAYOUT_KEY = 'cardTableLayout'
// Until a player picks, phones get the list: six seats round an oval are tight there.
const chosen = ref<Layout>(load<Layout>(LAYOUT_KEY) ?? (window.matchMedia('(max-width: 520px)').matches ? 'list' : 'table'))
const layout = computed(() => props.layout ?? chosen.value)
function setLayout(value: Layout) {
  chosen.value = value
  save(LAYOUT_KEY, value)
}

const isTappable = (id: PlayerId) => props.tappable.includes(id)
const seatClasses = (id: PlayerId) => ({
  'card-table__seat--turn': id === props.turn,
  // The TV is watched from across the room, so its turn seat keeps pulsing.
  'card-table__seat--pulse': id === props.turn && props.me === SPECTATOR_ID,
  'card-table__seat--tappable': isTappable(id),
  'card-table__seat--selected': id === props.selected,
  'card-table__seat--dimmed': props.dimmed.includes(id),
})

// The list starts with the viewer, then goes on in turn order, as the table does clockwise from the bottom.
const listed = computed(() => {
  const from = Math.max(0, props.seats.indexOf(props.me))
  return [...props.seats.slice(from), ...props.seats.slice(0, from)]
})

// Positions in % of the table box: an ellipse a little inside the edges so seats don't overflow.
// Screen y grows downwards, so increasing angles from the bottom run clockwise.
const placed = computed(() => {
  const n = props.seats.length
  const bottom = Math.max(0, props.seats.indexOf(props.me))
  return props.seats.map((id, i) => {
    const angle = Math.PI / 2 + ((i - bottom) * 2 * Math.PI) / n
    return { id, x: 50 + 37 * Math.cos(angle), y: 50 + 39 * Math.sin(angle) }
  })
})

// --- Moving cards ---

const root = ref<HTMLElement | null>(null)
const center = ref<HTMLElement | null>(null)
const seatEls = new Map<PlayerId, HTMLElement>()
const flightEls = new Map<string, HTMLElement>()
const setSeatEl = (id: PlayerId, el: unknown) => (el instanceof HTMLElement ? seatEls.set(id, el) : seatEls.delete(id))
const setFlightEl = (key: string, el: unknown) => (el instanceof HTMLElement ? flightEls.set(key, el) : flightEls.delete(key))

const flying = ref<{ key: string; face: unknown; flip: boolean }[]>([])
const running = new Set<Animation>()
const seen = new Set<string>()

onMounted(() => {
  const now = props.flights.filter((f) => f.onMount && !seen.has(f.id))
  for (const f of props.flights) seen.add(f.id)
  void launch(now)
})
watch(
  () => props.flights,
  (list) => {
    const fresh = list.filter((f) => !seen.has(f.id))
    for (const f of fresh) seen.add(f.id)
    void launch(fresh)
  },
)
// The new turn's seat gives a small bounce once the move's cards have landed.
watch(
  () => props.turn,
  (id) => {
    const el = id ? seatEls.get(id) : undefined
    if (el && !reducedMotion()) bump(el, layout.value === 'list' ? 1.03 : 1.1, FLIGHT_MS - 100)
  },
)
onBeforeUnmount(() => running.forEach((a) => a.cancel()))

interface Spot {
  el: Element
  /** Seats show small cards, so flights shrink there; null: sized to the anchor (a card-sized spot). */
  scale: number | null
  /** Bounces when cards land on it. */
  bounce: boolean
}

function spot(name: string): Spot | null {
  if (name === props.me) {
    // Your hand, when it's on screen: cards you play leave it and cards you get land in it.
    const hand = document.querySelector('[data-card-anchor="hand"]')
    const r = hand?.getBoundingClientRect()
    if (hand && r && r.width > 0 && r.top < window.innerHeight && r.bottom > 0) return { el: hand, scale: 1, bounce: false }
  }
  const seat = seatEls.get(name)
  if (seat) return { el: seat, scale: 0.55, bounce: true }
  if (name !== 'center') {
    const anchor = root.value?.querySelector(`[data-card-anchor="${CSS.escape(name)}"]`)
    if (anchor) return { el: anchor, scale: null, bounce: true }
  }
  return center.value ? { el: center.value, scale: 1, bounce: false } : null
}

function sizeAt(spot: Spot, card: HTMLElement): number {
  if (spot.scale !== null) return spot.scale
  const ratio = spot.el.getBoundingClientRect().height / (card.offsetHeight || 66)
  return Math.min(Math.max(ratio, 0.5), 1.6)
}

function middle(el: Element) {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function bump(el: Element, to: number, delay: number) {
  const a = el.animate([{ scale: 1 }, { scale: to }, { scale: 1 }], { duration: 300, delay, easing: 'ease-out' })
  running.add(a)
  void a.finished.catch(() => {}).finally(() => running.delete(a))
}

async function launch(list: CardFlight[]) {
  if (list.length === 0 || reducedMotion()) return
  const cards = list.flatMap((f) => {
    const n = Math.min(f.count ?? f.faces?.length ?? 1, MAX_FLIGHT_CARDS)
    return Array.from({ length: n }, (_, i) => {
      const face = f.faces?.[i] ?? null
      return { f, i, n, key: `${f.id}#${i}`, face, flip: !!f.flip && face !== null }
    })
  })
  flying.value.push(...cards.map(({ key, face, flip }) => ({ key, face, flip })))
  await nextTick()
  for (const c of cards) {
    const el = flightEls.get(c.key)
    const from = spot(c.f.from)
    const to = spot(c.f.to)
    if (!el || !from || !to) {
      done(c.key)
      continue
    }
    const a = middle(from.el)
    const b = middle(to.el)
    const rise = c.f.rise ?? 0
    // A reveal spreads its cards side by side and a little larger; others land in a loose stack.
    const end = {
      x: b.x + (rise ? (c.i - (c.n - 1) / 2) * 52 : c.i * 3),
      y: b.y - rise,
      s: rise ? 1.25 : sizeAt(to, el),
    }
    const lift = 40 + Math.hypot(end.x - a.x, end.y - a.y) * 0.15
    const peak = { x: (a.x + end.x) / 2, y: Math.min(a.y, end.y) - lift, s: Math.max(sizeAt(from, el), end.s) * 1.15 }
    const tilt = (((c.i * 37 + c.f.id.length * 13) % 21) - 10) * (rise ? 0.3 : 1)
    const flipFrom = c.flip ? 180 : 0
    const at = (x: number, y: number, s: number, r: number, ry: number) =>
      `translate(${x}px, ${y}px) translate(-50%, -50%) perspective(800px) rotateY(${ry}deg) rotate(${r}deg) scale(${s})`
    const hold = c.f.hold ?? 0
    const fade = 160
    const total = FLIGHT_MS + hold + fade
    const landed = FLIGHT_MS / total
    const delay = (c.f.delay ?? 0) + c.i * (c.f.stagger ?? 70)
    const settled = at(end.x, end.y, end.s, tilt / 3, 0)
    // Hidden until it leaves (opacity 0 first), up in an arc, turning over at the top if it flips.
    const anim = el.animate(
      [
        { offset: 0, transform: at(a.x, a.y, sizeAt(from, el), 0, flipFrom), opacity: 0, easing: 'ease-out' },
        { offset: landed * 0.1, opacity: 1 },
        { offset: landed * 0.5, transform: at(peak.x, peak.y, peak.s, tilt, c.flip ? 90 : 0), easing: 'ease-in' },
        { offset: landed, transform: settled, opacity: 1 },
        { offset: (FLIGHT_MS + hold) / total, transform: settled, opacity: 1 },
        { offset: 1, transform: settled, opacity: 0 },
      ],
      { duration: total, delay, fill: 'backwards' },
    )
    running.add(anim)
    if (c.i === c.n - 1 && to.bounce && !rise) bump(to.el, 1.08, delay + FLIGHT_MS)
    void anim.finished
      .catch(() => {})
      .finally(() => {
        running.delete(anim)
        done(c.key)
      })
  }
}

function done(key: string) {
  flying.value = flying.value.filter((f) => f.key !== key)
}
</script>

<style scoped>
.card-table-wrap {
  container-type: inline-size;
}
.card-table {
  position: relative;
  aspect-ratio: 16 / 10;
}
.card-table__felt {
  position: absolute;
  inset: 16% 12%;
  border-radius: 50%;
  background: rgba(var(--v-theme-success), 0.16);
  border: 3px solid rgba(var(--v-theme-success), 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.card-table__seat {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 24%;
  max-width: 150px;
  padding: 4px 6px;
  border-radius: 10px;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  text-align: center;
  transition: border-color 0.15s, background-color 0.15s;
}
.card-table__seat--turn {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.25);
}
.card-table__seat--pulse {
  animation: card-table-pulse 1.6s ease-in-out infinite;
}
@keyframes card-table-pulse {
  50% {
    box-shadow: 0 0 0 9px rgba(var(--v-theme-primary), 0.12);
  }
}
@media (prefers-reduced-motion: reduce) {
  .card-table__seat--pulse {
    animation: none;
  }
}
.card-table__seat--tappable {
  cursor: pointer;
  border-style: dashed;
  border-color: rgb(var(--v-theme-primary));
}
/* Seats stay opaque so the felt never shows through: the tint is layered over the surface colour,
   and a dimmed seat fades its contents rather than the whole box. */
.card-table__seat--selected {
  border-style: solid;
  background: linear-gradient(rgba(var(--v-theme-primary), 0.18), rgba(var(--v-theme-primary), 0.18)), rgb(var(--v-theme-surface));
}
.card-table__seat--dimmed > * {
  opacity: 0.45;
}
.card-table__name {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 500;
  min-width: 0;
}

/* List layout: one row per seat, name on the left and the game's seat content on the right. */
.card-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.card-list__center {
  display: flex;
  justify-content: center;
  padding: 8px;
  border-radius: 10px;
  background: rgba(var(--v-theme-success), 0.16);
}
.card-table__seat.card-list__row {
  position: static;
  transform: none;
  width: 100%;
  max-width: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  text-align: left;
}
.card-list__name {
  flex: 0 1 40%;
  justify-content: flex-start;
}
.card-list__content {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  column-gap: 8px;
}

/* Flying cards: fixed to the viewport, since positions come from getBoundingClientRect. Hidden
   outside their animation, so a card never shows at the corner before or after it flies. */
.card-flights {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2000;
}
.card-flight {
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0;
  transform-style: preserve-3d;
  will-change: transform, opacity;
}
.card-flight__side {
  backface-visibility: hidden;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.3);
}
/* A flipping card's back faces away at the start, then turns to show the face. */
.card-flight__back {
  position: absolute;
  inset: 0;
  transform: rotateY(180deg);
}

/* Phones: a squarer table and smaller seats, so six seats still fit round it. */
@container (max-width: 520px) {
  .card-table {
    aspect-ratio: 1 / 1.05;
  }
  .card-table__felt {
    inset: 18% 15%;
  }
  .card-table__seat:not(.card-list__row) {
    /* Side seats sit at 13%, so 26% wide just reaches the edge. */
    width: 26%;
    padding: 2px 4px;
  }
  .card-table__name:not(.card-list__name) {
    font-size: 0.75rem;
  }
}
</style>

<!-- Not scoped: the games' hand components use it, through `useArrivals` (flights.ts). They're
     always on screen with a CardTable, so the rule is loaded whenever it's needed. -->
<style>
/* A card new to your hand drops into place once the flight bringing it has landed. */
.card-arrive {
  animation: card-arrive 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) calc(var(--arrive-delay, 430ms) + var(--arrive-i, 0) * 60ms) backwards;
}
@keyframes card-arrive {
  from {
    opacity: 0;
    transform: translateY(-28px) scale(0.7);
  }
}
@media (prefers-reduced-motion: reduce) {
  .card-arrive {
    animation: none;
  }
}
</style>
