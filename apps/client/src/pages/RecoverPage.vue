<template>
  <v-container class="py-8" style="max-width: 440px">
    <v-card class="pa-2">
      <v-card-title class="text-headline-small">Recover your account</v-card-title>
      <v-card-text class="text-body-medium">
        Enter the recovery code you were given and choose a new password. Codes come from whoever runs this server;
        each works once and expires after 24 hours.
      </v-card-text>
      <v-card-text>
        <v-form @submit.prevent="submit">
          <v-text-field
            v-model="code"
            label="Recovery code"
            placeholder="ABCD-EFGH-JKMN"
            autocomplete="one-time-code"
            autocapitalize="characters"
            spellcheck="false"
            :error-messages="codeError"
            autofocus
            @update:model-value="codeError = ''"
          />
          <v-text-field
            v-model="password"
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
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">{{ error }}</v-alert>
          <v-btn type="submit" color="primary" size="large" block :loading="busy" :disabled="!valid">Set password</v-btn>
        </v-form>
      </v-card-text>
      <v-card-text class="text-body-medium">
        <router-link :to="{ name: 'login' }">Back to sign in</router-link>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
/** Redeem a recovery code from the server command (apps/server/src/recovery.ts) for a new password. */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { authClient } from '../lib/auth-client.ts'
import { toast } from '../lib/room.ts'

// Better Auth's password limits, which the server enforces.
const MIN = 8
const MAX = 128

const router = useRouter()
const code = ref('')
const password = ref('')
const confirm = ref('')
const show = ref(false)
const busy = ref(false)
const codeError = ref('')
const error = ref('')

/** Same as normalizeRecoveryCode on the server: case, dashes and spaces don't matter. */
const token = computed(() => code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
const lengthRule = (v: string) =>
  (v.length >= MIN && v.length <= MAX) || (v.length < MIN ? `At least ${MIN} characters` : `At most ${MAX} characters`)
const matchRule = (v: string) => v === password.value || "Doesn't match the new password"
const valid = computed(() => token.value.length === 12 && lengthRule(password.value) === true && matchRule(confirm.value) === true)

async function submit() {
  if (!valid.value) return
  busy.value = true
  error.value = ''
  const { error: failed } = await authClient.resetPassword({ token: token.value, newPassword: password.value })
  busy.value = false
  if (failed) {
    if (failed.status === 429) error.value = 'Too many attempts. Wait a minute and try again.'
    else if (failed.code === 'INVALID_TOKEN') codeError.value = "That code isn't valid. It may have been used, replaced by a newer one, or expired."
    else error.value = failed.message ?? 'Could not set your password'
    return
  }
  toast('Password set. Sign in with your new password.', 'success')
  void router.push({ name: 'login' })
}
</script>
