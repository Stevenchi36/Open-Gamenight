<template>
  <div>
    <QuestionCard compact :question="view.question" :server-now="serverNow" />

    <template v-if="amHost">
      <div class="text-title-large mb-1">Any answers that mean the same?</div>
      <div class="text-body-medium text-medium-emphasis mb-3">
        {{
          selected
            ? `Now tap the answer to merge "${labelOf(selected)}" into, or tap it again to cancel.`
            : 'Tap an answer, then the one it matches, to merge them. Score it when the groups look right.'
        }}
      </div>
    </template>
    <div v-else class="text-body-medium text-medium-emphasis mb-3">
      {{ nameOf(room, room.hostId) }} is checking for answers that mean the same thing.
    </div>

    <GroupList
      :groups="view.groups"
      :flock-id="view.flockId"
      :room="room"
      :selectable="amHost"
      :selected="selected"
      :splittable="amHost"
      @pick="pick"
      @split="(group) => send({ type: 'split_group', group })"
    />

    <div class="text-body-large text-center mb-4">{{ flockLine }}</div>

    <v-btn v-if="amHost" block size="x-large" color="primary" prepend-icon="mdi-check" @click="send({ type: 'score_round' })">
      Score it
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { isHost, nameOf } from '@ogn/core/ui'
import { computed, ref, watch } from 'vue'
import GroupList from '../GroupList.vue'
import QuestionCard from '../QuestionCard.vue'
import { flockSummary } from '../flock-summary.ts'
import type { PhaseProps } from '../props.ts'

const props = defineProps<PhaseProps>()
const amHost = computed(() => isHost(props.room, props.me))
const selected = ref<string | null>(null)
const flockLine = computed(() => flockSummary(props.view, 'so far'))

const labelOf = (id: string) => props.view.groups.find((g) => g.id === id)?.label ?? ''

function pick(id: string) {
  if (selected.value === null) selected.value = id
  else if (selected.value === id) selected.value = null
  else {
    props.send({ type: 'merge_groups', from: selected.value, into: id })
    selected.value = null
  }
}

// A selection that no longer exists (merged or split away) is dropped.
watch(
  () => props.view.groups.map((g) => g.id).join('|'),
  () => {
    if (selected.value && !props.view.groups.some((g) => g.id === selected.value)) selected.value = null
  },
)
</script>
