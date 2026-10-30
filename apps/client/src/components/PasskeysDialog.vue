<template>
  <v-dialog :model-value="open" max-width="460" @update:model-value="$emit('update:open', $event)">
    <v-card title="Passkeys">
      <v-card-text>
        <p class="text-body-medium mb-4">
          Sign in with your phone, computer or password manager (like Bitwarden) instead of typing your password.
          Your password keeps working too.
        </p>
        <v-alert v-if="!passkeysSupported" type="info" variant="tonal" density="compact">
          Passkeys only work when this site is opened over HTTPS.
        </v-alert>
        <template v-else>
          <v-progress-linear v-if="loading" indeterminate class="mb-2" />
          <p v-else-if="!passkeys.length" class="text-body-medium text-medium-emphasis">You haven't added a passkey yet.</p>
          <v-list v-else density="compact" class="py-0">
            <v-list-item
              v-for="key in passkeys"
              :key="key.id"
              prepend-icon="mdi-key-variant"
              :title="label(key)"
              :subtitle="`Added ${new Date(key.createdAt).toLocaleDateString()}`"
              class="px-0"
            >
              <template #append>
                <v-btn icon="mdi-pencil" variant="text" size="small" :aria-label="`Rename ${label(key)}`" @click="renaming = key" />
                <v-btn icon="mdi-delete" variant="text" size="small" :aria-label="`Remove ${label(key)}`" @click="removing = key" />
              </template>
            </v-list-item>
          </v-list>
          <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-2">{{ error }}</v-alert>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-btn v-if="passkeysSupported" color="primary" prepend-icon="mdi-plus" :loading="adding" @click="add">Add a passkey</v-btn>
        <v-spacer />
        <v-btn @click="$emit('update:open', false)">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <AccountNameDialog
    :open="!!renaming"
    title="Rename passkey"
    :current="renaming ? label(renaming) : ''"
    hint="Something that tells you where it's saved, like Phone or Bitwarden."
    :saving="saving"
    @update:open="renaming = null"
    @save="rename"
  />

  <v-dialog :model-value="!!removing" max-width="380" @update:model-value="removing = null">
    <v-card :title="`Remove ${removing ? label(removing) : ''}?`" text="You won't be able to sign in with it any more. Also delete it from the device or password manager that holds it.">
      <v-card-actions>
        <v-spacer />
        <v-btn @click="removing = null">Cancel</v-btn>
        <v-btn color="error" :loading="saving" @click="remove">Remove</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/** The signed-in user's passkeys (account menu): add, rename, remove. */
import { ref, watch } from 'vue'
import { authClient, errorCode, passkeysSupported } from '../lib/auth-client.ts'
import { toast } from '../lib/room.ts'
import AccountNameDialog from './AccountNameDialog.vue'

interface Passkey {
  id: string
  name?: string | null
  createdAt: string | Date
}

const props = defineProps<{ open: boolean }>()
defineEmits<{ 'update:open': [open: boolean] }>()

const passkeys = ref<Passkey[]>([])
const loading = ref(false)
const adding = ref(false)
const saving = ref(false)
const error = ref('')
const renaming = ref<Passkey | null>(null)
const removing = ref<Passkey | null>(null)

const label = (key: Passkey) => key.name || 'Passkey'

async function load() {
  loading.value = true
  const { data, error: failed } = await authClient.passkey.listUserPasskeys()
  loading.value = false
  if (failed) error.value = 'Could not load your passkeys'
  else passkeys.value = data
}

watch(
  () => props.open,
  (open) => {
    if (!open || !passkeysSupported) return
    error.value = ''
    void load()
  },
)

async function add() {
  adding.value = true
  error.value = ''
  const { error: failed } = await authClient.passkey.addPasskey()
  adding.value = false
  if (failed) {
    // Closed the prompt: nothing to report.
    const code = errorCode(failed)
    if (code === 'ERROR_CEREMONY_ABORTED' || code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY') return
    if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') error.value = 'That device or password manager already has a passkey for your account.'
    else if (code === 'SESSION_NOT_FRESH') error.value = 'For your security, sign out and sign in again before adding a passkey.'
    else error.value = "Couldn't add the passkey. Try again."
    return
  }
  toast('Passkey added', 'success')
  await load()
}

async function rename(name: string) {
  if (!renaming.value) return
  saving.value = true
  const { error: failed } = await authClient.passkey.updatePasskey({ id: renaming.value.id, name })
  saving.value = false
  if (failed) {
    toast(failed.message ?? 'Could not rename the passkey', 'error')
    return
  }
  renaming.value = null
  await load()
}

async function remove() {
  if (!removing.value) return
  saving.value = true
  const { error: failed } = await authClient.passkey.deletePasskey({ id: removing.value.id })
  saving.value = false
  if (failed) {
    toast('Could not remove the passkey', 'error')
    return
  }
  removing.value = null
  toast('Passkey removed', 'success')
  await load()
}
</script>
