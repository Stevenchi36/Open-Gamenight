<template>
  <div class="d-flex align-center ga-3">
    <div class="flex-grow-1" style="min-width: 0">
      <div v-if="item.clue" class="text-body-large font-weight-medium" style="overflow-wrap: anywhere">{{ item.clue }}</div>
      <div v-else class="text-body-medium text-medium-emphasis font-italic">{{ mine ? 'Waiting for your clue…' : `Waiting for ${name}…` }}</div>
      <div class="text-body-small text-medium-emphasis d-flex align-center ga-1">
        {{ name }}
        <v-chip v-if="mine" size="x-small" color="primary" variant="flat">You</v-chip>
      </div>
    </div>
    <slot name="append" />
  </div>
</template>

<script setup lang="ts">
// One card in the line: its clue (or who it's waiting on) and whose it is.
import type { RoomView } from '@ogn/core/protocol'
import { nameOf } from '@ogn/core/ui'
import { computed } from 'vue'
import type { LineItem } from '../shared/index.ts'

const props = defineProps<{ item: LineItem; room: RoomView; me: string }>()
const mine = computed(() => props.item.playerId === props.me)
const name = computed(() => nameOf(props.room, props.item.playerId))
</script>
