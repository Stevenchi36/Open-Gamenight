<template>
  <v-container class="py-8" style="max-width: 440px">
    <v-card class="pa-2">
      <v-card-title class="text-headline-small">Sign in</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="submit">
          <!-- "webauthn" lets the browser or a password manager offer saved passkeys in this field. -->
          <v-text-field
            v-model="email"
            label="Email"
            type="email"
            :autocomplete="passkeysSupported ? 'username webauthn' : 'username'"
            autofocus
            required
          />
          <v-text-field
            v-model="password"
            label="Password"
            :type="show ? 'text' : 'password'"
            autocomplete="current-password"
            :append-inner-icon="show ? 'mdi-eye-off' : 'mdi-eye'"
            required
            @click:append-inner="show = !show"
          />
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">{{ error }}</v-alert>
          <v-btn type="submit" color="primary" size="large" block :loading="busy">Sign in</v-btn>
        </v-form>
        <template v-if="passkeysSupported">
          <div class="d-flex align-center my-4 text-medium-emphasis text-body-medium">
            <v-divider /><span class="mx-3">or</span><v-divider />
          </div>
          <v-btn variant="outlined" size="large" block prepend-icon="mdi-key-variant" :loading="passkeyBusy" @click="signInWithPasskey(false)">
            Sign in with a passkey
          </v-btn>
        </template>
      </v-card-text>
      <v-card-text class="text-body-medium text-medium-emphasis">
        You only need an account to create rooms; anyone can join a room with its code.
        Accounts are created by an admin. Forgot your password? Ask an admin to reset it.
      </v-card-text>
      <v-card-text class="text-body-medium pt-0">
        <router-link :to="{ name: 'recover' }">Have a recovery code?</router-link>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authClient, errorCode, passkeysSupported } from '../lib/auth-client.ts'
import { refreshSession } from '../lib/room.ts'

const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const show = ref(false)
const busy = ref(false)
const passkeyBusy = ref(false)
const error = ref('')
let left = false

function signedIn() {
  refreshSession()
  const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
  void router.push(redirect)
}

async function submit() {
  busy.value = true
  error.value = ''
  const { error: failed } = await authClient.signIn.email({ email: email.value.trim(), password: password.value })
  busy.value = false
  if (failed) {
    error.value = failed.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'Wrong email or password.'
    return
  }
  signedIn()
}

/**
 * autoFill waits quietly for the person to pick a passkey from the email field's suggestions;
 * the button asks the browser to show its passkey prompt now (and replaces any waiting request).
 */
async function signInWithPasskey(autoFill: boolean) {
  if (!autoFill) {
    passkeyBusy.value = true
    error.value = ''
  }
  const { error: failed } = await authClient.signIn.passkey({ autoFill })
  if (!autoFill) passkeyBusy.value = false
  // A request still waiting when the person signed in some other way, or left the page.
  if (left) return
  if (!failed) return signedIn()
  // The person closed the prompt, or a newer request replaced this one: nothing to report.
  const code = errorCode(failed)
  if (code === 'AUTH_CANCELLED' || code.startsWith('ERROR_')) return
  if (failed.status === 429) error.value = 'Too many attempts. Wait a minute and try again.'
  else if (failed.status === 401) error.value = "That passkey isn't on any account here. It may have been removed."
  else if (failed.status === 403) error.value = 'This account is banned.'
  else error.value = "Couldn't sign in with that passkey. Try again."
}

onMounted(async () => {
  if (passkeysSupported && (await PublicKeyCredential.isConditionalMediationAvailable?.())) void signInWithPasskey(true)
})
onUnmounted(() => {
  left = true
})
</script>
