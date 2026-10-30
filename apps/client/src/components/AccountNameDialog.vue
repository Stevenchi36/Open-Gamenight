<template>
  <v-dialog :model-value="open" max-width="400" @update:model-value="$emit('update:open', $event)">
    <v-card :title="title">
      <v-form @submit.prevent="submit">
        <v-card-text>
          <v-text-field
            v-model="name"
            label="Name"
            :rules="[rule]"
            :counter="ACCOUNT_NAME_MAX_LENGTH"
            :hint="hint"
            persistent-hint
            autofocus
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="$emit('update:open', false)">Cancel</v-btn>
          <v-btn type="submit" color="primary" :loading="saving" :disabled="!valid || name.trim() === current">Save</v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/** Change an account name: the user's own (account menu) or anyone's (admin Users page). */
import { ACCOUNT_NAME_MAX_LENGTH, accountName } from '@ogn/core/protocol'
import { computed, ref, watch } from 'vue'

const props = defineProps<{ open: boolean; title: string; current: string; hint?: string; saving?: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; save: [name: string] }>()

const name = ref('')
watch(
  () => props.open,
  (open) => {
    if (open) name.value = props.current
  },
  { immediate: true },
)

const rule = (value: string) => {
  const parsed = accountName.safeParse(value)
  return parsed.success || parsed.error.issues[0]!.message
}
const valid = computed(() => rule(name.value) === true)

function submit() {
  if (valid.value && name.value.trim() !== props.current) emit('save', name.value.trim())
}
</script>
