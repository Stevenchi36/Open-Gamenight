<template>
  <div class="mb-4">
    <v-card
      v-for="(group, g) in groups"
      :key="group.id"
      :color="cardColor(group.id)"
      :variant="group.id === selected ? 'flat' : 'tonal'"
      class="mb-2"
      :class="{ 'group--in': stagger, 'group--selectable': selectable }"
      :style="stagger ? { animationDelay: `${g * 180}ms` } : undefined"
    >
      <button
        v-if="selectable"
        type="button"
        class="group-pick"
        :aria-label="pickLabel(group)"
        :aria-pressed="group.id === selected"
        @click="emit('pick', group.id)"
      />
      <v-card-text class="d-flex align-center ga-3 py-3">
        <div class="text-headline-small font-weight-bold" style="min-width: 1.5ch">{{ group.answers.length }}</div>
        <div class="flex-grow-1">
          <div class="text-body-large font-weight-medium">
            {{ group.label }}
            <v-chip v-if="group.id === flockId" size="x-small" color="success" variant="flat" class="ml-1">The flock</v-chip>
          </div>
          <div class="text-body-medium text-medium-emphasis">
            <span v-for="(a, i) in group.answers" :key="a.playerId">
              {{ i ? ', ' : '' }}{{ nameOf(room, a.playerId) }}<template v-if="a.text !== group.label"> ({{ a.text }})</template>
            </span>
          </div>
        </div>
        <v-btn v-if="splittable && group.merged" class="group-split" size="small" variant="text" :aria-label="`Split ${group.label}`" @click="emit('split', group.id)">
          Split
        </v-btn>
      </v-card-text>
    </v-card>
    <div v-if="groups.length === 0" class="text-body-medium text-medium-emphasis text-center">Nobody answered.</div>
  </div>
</template>

<script setup lang="ts">
// Answers grouped after the reveal, biggest first; the flock is highlighted. In REVIEW the host
// taps groups to merge them (`pick`) and splits merged ones. While picking, each card is covered by a
// transparent button (a v-card with @click alone isn't keyboard reachable), with Split on top of it.
import type { RoomView } from '@ogn/core/protocol'
import { nameOf } from '@ogn/core/ui'
import type { AnswerGroup } from '../shared/index.ts'

const props = defineProps<{
  groups: AnswerGroup[]
  flockId: string | null
  room: RoomView
  selectable?: boolean
  selected?: string | null
  splittable?: boolean
  /** Cards drop in one after another (the TV's reveal). */
  stagger?: boolean
}>()
const emit = defineEmits<{ pick: [id: string]; split: [id: string] }>()

/** What tapping the group does, for screen readers: the visible hint above says it in words too. */
function pickLabel(group: AnswerGroup): string {
  const chosen = props.groups.find((g) => g.id === props.selected)
  const n = group.answers.length
  if (!chosen) return `${group.label}, ${n} ${n === 1 ? 'answer' : 'answers'}: pick to merge`
  if (chosen.id === group.id) return `${group.label}: picked, tap again to cancel`
  return `Merge ${chosen.label} into ${group.label}`
}

function cardColor(id: string) {
  if (id === props.selected) return 'primary'
  return id === props.flockId ? 'success' : undefined
}
</script>

<style scoped>
.group--selectable {
  position: relative;
}
.group-pick {
  position: absolute;
  inset: 0;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: none;
  cursor: pointer;
}
.group-pick:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.group-pick:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}
/* Taps on the card's content fall through to the button, except on Split. */
.group--selectable :deep(.v-card-text) {
  position: relative;
  pointer-events: none;
}
.group-split {
  pointer-events: auto;
}
.group--in {
  animation: group-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}
@keyframes group-in {
  from {
    transform: translateY(-16px) scale(0.92);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .group--in {
    animation: none;
  }
}
</style>
