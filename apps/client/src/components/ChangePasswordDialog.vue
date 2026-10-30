<template>
  <v-dialog :model-value="open" max-width="420" @update:model-value="$emit('update:open', $event)">
    <v-card title="Change your password">
      <v-form @submit.prevent="submit">
        <v-card-text>
          <v-text-field
            v-model="current"
            label="Current password"
            :type="show ? 'text' : 'password'"
            autocomplete="current-password"
            :error-messages="currentError"
            autofocus
            @update:model-value="currentError = ''"
          />
          <v-text-field
            v-model="next"
            label="New password"
            :type="show ? 'text' : 'password'"
            autocomplete="new-password"
            :rules="[lengthRule]"
          >
            <template #append-inner>
              <v-btn
                :icon="show ? 'mdi-eye-off' : 'mdi-eye'"
                :aria-label="show ? 'Hide passwords' : 'Show passwords'"
                :aria-pressed="show"
                variant="text"
                size="small"
                density="comfortable"
                @click="show = !show"
              />
            </template>
          </v-text-field>
          <v-text-field
            v-model="confirm"
            label="New password again"
            :type="show ? 'text' : 'password'"
            autocomplete="new-password"
            :rules="[matchRule]"
          />
          <v-checkbox v-model="signOutOthers" label="Sign out my other devices" color="primary" hide-details />
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-2">{{ error }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="$emit('update:open', false)">Cancel</v-btn>
          <v-btn type="submit" color="primary" :loading="saving" :disabled="!valid">Change password</v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/** The signed-in user changes their own password (account menu). Admins reset other people's on the Users page. */
import { computed, ref, watch } from 'vue'
import { authClient } from '../lib/auth-client.ts'
import { toast } from '../lib/room.ts'

// Better Auth's defaults (minPasswordLength / maxPasswordLength), which the server enforces.
const MIN = 8
const MAX = 128

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const current = ref('')
const next = ref('')
const confirm = ref('')
const signOutOthers = ref(true)
const show = ref(false)
const saving = ref(false)
const currentError = ref('')
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    current.value = next.value = confirm.value = currentError.value = error.value = ''
    signOutOthers.value = true
    show.value = false
  },
)

const lengthRule = (v: string) =>
  (v.length >= MIN && v.length <= MAX) || (v.length < MIN ? `At least ${MIN} characters` : `At most ${MAX} characters`)
const matchRule = (v: string) => v === next.value || "Doesn't match the new password"
const valid = computed(() => !!current.value && lengthRule(next.value) === true && matchRule(confirm.value) === true)

async function submit() {
  if (!valid.value) return
  saving.value = true
  error.value = ''
  const { error: failed } = await authClient.changePassword({
    currentPassword: current.value,
    newPassword: next.value,
    revokeOtherSessions: signOutOthers.value,
  })
  saving.value = false
  if (failed) {
    if (failed.code === 'INVALID_PASSWORD') currentError.value = "That isn't your current password"
    else if (failed.status === 429) error.value = 'Too many attempts. Wait a minute and try again.'
    else error.value = failed.message ?? 'Could not change your password'
    return
  }
  emit('update:open', false)
  toast(signOutOthers.value ? 'Password changed. Your other devices are signed out.' : 'Password changed', 'success')
}
</script>
