<template>
  <div class="mb-4">
    <v-card
      v-for="group in groups"
      :key="group.id"
      :color="cardColor(group.id)"
      :variant="group.id === selected ? 'flat' : 'tonal'"
      class="mb-2"
      v-bind="selectable ? { onClick: () => emit('pick', group.id) } : {}"
    >
      <v-card-text class="d-flex align-center ga-3 py-3">
        <div class="text-h5 font-weight-bold" style="min-width: 1.5ch">{{ group.answers.length }}</div>
        <div class="flex-grow-1">
          <div class="text-subtitle-1 font-weight-medium">
            {{ group.label }}
            <v-chip v-if="group.id === flockId" size="x-small" color="success" variant="flat" class="ml-1">The flock</v-chip>
          </div>
          <div class="text-body-2 text-medium-emphasis">
            <span v-for="(a, i) in group.answers" :key="a.playerId">
              {{ i ? ', ' : '' }}{{ nameOf(room, a.playerId) }}<template v-if="a.text !== group.label"> ({{ a.text }})</template>
            </span>
          </div>
        </div>
        <v-btn v-if="splittable && group.merged" size="small" variant="text" @click.stop="emit('split', group.id)">Split</v-btn>
      </v-card-text>
    </v-card>
    <div v-if="groups.length === 0" class="text-body-2 text-medium-emphasis text-center">Nobody answered.</div>
  </div>
</template>

<script setup lang="ts">
// Answers grouped after the reveal, biggest first; the flock is highlighted. In REVIEW the host
// taps groups to merge them (`pick`) and splits merged ones.
import type { RoomView } from '@wsfg/core/protocol'
import { nameOf } from '@wsfg/core/ui'
import type { AnswerGroup } from '../shared/index.ts'

const props = defineProps<{
  groups: AnswerGroup[]
  flockId: string | null
  room: RoomView
  selectable?: boolean
  selected?: string | null
  splittable?: boolean
}>()
const emit = defineEmits<{ pick: [id: string]; split: [id: string] }>()

function cardColor(id: string) {
  if (id === props.selected) return 'primary'
  return id === props.flockId ? 'success' : undefined
}
</script>
