<template>
  <v-container class="py-8" style="max-width: 440px">
    <v-card class="pa-2">
      <v-card-title class="text-headline-small">Sign in</v-card-title>
      <v-card-text>
        <v-form @submit.prevent="submit">
          <v-text-field v-model="email" label="Email" type="email" autocomplete="username" autofocus required />
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
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authClient } from '../lib/auth-client.ts'
import { refreshSession } from '../lib/room.ts'

const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const show = ref(false)
const busy = ref(false)
const error = ref('')

async function submit() {
  busy.value = true
  error.value = ''
  const { error: failed } = await authClient.signIn.email({ email: email.value.trim(), password: password.value })
  busy.value = false
  if (failed) {
    error.value = failed.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'Wrong email or password.'
    return
  }
  refreshSession()
  const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
  void router.push(redirect)
}
</script>
