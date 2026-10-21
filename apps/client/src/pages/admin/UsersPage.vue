<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5">Users</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-account-plus" @click="openCreate">New user</v-btn>
    </div>

    <v-card>
      <v-data-table :headers="headers" :items="users" :loading="loading" item-value="id" density="comfortable">
        <template #[`item.name`]="{ item }">
          <div class="font-weight-medium">{{ item.name }}</div>
          <div class="text-caption text-medium-emphasis">{{ item.email }}</div>
        </template>
        <template #[`item.role`]="{ item }">
          <v-chip :color="item.role === 'admin' ? 'primary' : undefined" size="small" variant="tonal">{{ item.role ?? 'user' }}</v-chip>
          <v-chip v-if="item.banned" color="error" size="small" class="ml-1">banned</v-chip>
        </template>
        <template #[`item.createdAt`]="{ item }">{{ new Date(item.createdAt).toLocaleDateString() }}</template>
        <template #[`item.actions`]="{ item }">
          <v-menu v-if="item.id !== me">
            <template #activator="{ props: menu }">
              <v-btn v-bind="menu" icon="mdi-dots-vertical" variant="text" size="small" :aria-label="`Actions for ${item.name}`" />
            </template>
            <v-list density="compact">
              <v-list-item
                :prepend-icon="item.role === 'admin' ? 'mdi-account-arrow-down' : 'mdi-shield-crown'"
                :title="item.role === 'admin' ? 'Make regular user' : 'Make admin'"
                @click="toggleRole(item)"
              />
              <v-list-item prepend-icon="mdi-lock-reset" title="Set password" @click="openPassword(item)" />
              <v-list-item
                v-if="!item.banned"
                prepend-icon="mdi-cancel"
                title="Ban"
                @click="setBanned(item, true)"
              />
              <v-list-item v-else prepend-icon="mdi-check" title="Unban" @click="setBanned(item, false)" />
              <v-list-item prepend-icon="mdi-delete" title="Delete" base-color="error" @click="toDelete = item" />
            </v-list>
          </v-menu>
          <span v-else class="text-caption text-medium-emphasis">you</span>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="creating" max-width="440">
      <v-card title="New user">
        <v-card-text>
          <v-text-field v-model="form.name" label="Name" />
          <v-text-field v-model="form.email" label="Email" type="email" />
          <v-text-field v-model="form.password" label="Temporary password" hint="At least 8 characters. Share it with them privately." persistent-hint />
          <v-switch v-model="form.admin" label="Admin" color="primary" hide-details />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="creating = false">Cancel</v-btn>
          <v-btn color="primary" :disabled="!form.name || !form.email || form.password.length < 8" @click="create">Create</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="!!passwordFor" max-width="400" @update:model-value="passwordFor = null">
      <v-card :title="`Set password for ${passwordFor?.name}`">
        <v-card-text>
          <v-text-field v-model="newPassword" label="New password" hint="At least 8 characters" persistent-hint />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="passwordFor = null">Cancel</v-btn>
          <v-btn color="primary" :disabled="newPassword.length < 8" @click="setPassword">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="!!toDelete" max-width="380" @update:model-value="toDelete = null">
      <v-card :title="`Delete ${toDelete?.name}?`" text="This removes their account and signs them out. Rooms they're playing in keep going.">
        <v-card-actions>
          <v-spacer />
          <v-btn @click="toDelete = null">Cancel</v-btn>
          <v-btn color="error" @click="remove">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { authClient } from '../../lib/auth-client.ts'
import { toast } from '../../lib/room.ts'

interface Row {
  id: string
  name: string
  email: string
  role?: string | null
  banned?: boolean | null
  createdAt: string | Date
}

const session = authClient.useSession()
const me = computed(() => session.value.data?.user.id)
const users = ref<Row[]>([])
const loading = ref(false)
const headers = [
  { title: 'User', key: 'name' },
  { title: 'Role', key: 'role' },
  { title: 'Created', key: 'createdAt' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

async function load() {
  loading.value = true
  const { data, error } = await authClient.admin.listUsers({ query: { limit: 500, sortBy: 'createdAt', sortDirection: 'desc' } })
  loading.value = false
  if (error) return toast(error.message ?? 'Could not load users', 'error')
  users.value = (data?.users ?? []) as Row[]
}
onMounted(load)

/** Run a Better Auth admin call, report its error, refresh the list. */
async function run(call: () => Promise<{ error: { message?: string } | null }>, done?: string) {
  const { error } = await call()
  if (error) toast(error.message ?? 'Something went wrong', 'error')
  else if (done) toast(done, 'success')
  await load()
}

function toggleRole(row: Row) {
  const role = row.role === 'admin' ? 'user' : 'admin'
  return run(() => authClient.admin.setRole({ userId: row.id, role }), `${row.name} is now ${role === 'admin' ? 'an admin' : 'a regular user'}`)
}
function setBanned(row: Row, banned: boolean) {
  return run(
    () => (banned ? authClient.admin.banUser({ userId: row.id }) : authClient.admin.unbanUser({ userId: row.id })),
    `${row.name} ${banned ? 'banned' : 'unbanned'}`,
  )
}

const creating = ref(false)
const form = reactive({ name: '', email: '', password: '', admin: false })
function openCreate() {
  Object.assign(form, { name: '', email: '', password: '', admin: false })
  creating.value = true
}
async function create() {
  creating.value = false
  await run(
    () =>
      authClient.admin.createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.admin ? 'admin' : 'user',
      }),
    `Created ${form.email}`,
  )
}

const passwordFor = ref<Row | null>(null)
const newPassword = ref('')
function openPassword(row: Row) {
  passwordFor.value = row
  newPassword.value = ''
}
async function setPassword() {
  const row = passwordFor.value!
  passwordFor.value = null
  await run(() => authClient.admin.setUserPassword({ userId: row.id, newPassword: newPassword.value }), `Password updated for ${row.name}`)
}

const toDelete = ref<Row | null>(null)
async function remove() {
  const row = toDelete.value!
  toDelete.value = null
  await run(() => authClient.admin.removeUser({ userId: row.id }), `Deleted ${row.name}`)
}
</script>
