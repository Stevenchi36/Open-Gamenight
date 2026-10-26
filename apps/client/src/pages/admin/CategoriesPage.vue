<template>
  <div>
    <h1 class="text-headline-small mb-1">Categories</h1>
    <div class="text-body-medium text-medium-emphasis mb-4">{{ gameName }}</div>

    <v-card class="mb-4">
      <v-card-text>
        <v-form class="d-flex ga-2 align-start" @submit.prevent="create">
          <v-text-field v-model="newName" label="New category" maxlength="39" counter hide-details="auto" density="comfortable" />
          <v-btn type="submit" color="primary" size="large" :disabled="!newName.trim()" prepend-icon="mdi-plus">Add</v-btn>
        </v-form>
      </v-card-text>
    </v-card>

    <v-card>
      <v-data-table :headers="headers" :items="categories" :loading="loading" item-value="id" density="comfortable" :items-per-page="50">
        <template #[`item.count`]="{ item }">
          <v-chip size="small" variant="tonal" :color="item.count === 0 ? 'warning' : undefined">{{ item.count }}</v-chip>
        </template>
        <template #[`item.createdAt`]="{ item }">{{ new Date(item.createdAt + 'Z').toLocaleDateString() }}</template>
        <template #[`item.actions`]="{ item }">
          <v-btn icon="mdi-pencil" variant="text" size="small" :aria-label="`Rename ${item.name}`" @click="openRename(item)" />
          <v-tooltip :disabled="item.count === 0" location="top" :text="`Move or delete its ${item.count} item(s) first`">
            <template #activator="{ props: tip }">
              <span v-bind="tip">
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  size="small"
                  color="error"
                  :disabled="item.count > 0"
                  :aria-label="`Delete ${item.name}`"
                  @click="remove(item)"
                />
              </span>
            </template>
          </v-tooltip>
        </template>
        <template #no-data>No categories yet. Add one above, or they're created when words are added with a new category name.</template>
      </v-data-table>
    </v-card>

    <v-dialog :model-value="!!renaming" max-width="400" @update:model-value="renaming = null">
      <v-card :title="`Rename ${renaming?.name}`">
        <v-card-text>
          <v-text-field v-model="renameTo" label="Name" maxlength="39" counter autofocus @keyup.enter="rename" />
          <div class="text-body-small text-medium-emphasis">Everything in this category moves with it.</div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="renaming = null">Cancel</v-btn>
          <v-btn color="primary" :disabled="!renameTo.trim()" @click="rename">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { config } from '../../lib/config.ts'
import { toast } from '../../lib/room.ts'
import { computed, ref, watch } from 'vue'

interface Category {
  id: number
  name: string
  count: number
  createdAt: string
}

const props = defineProps<{ gameId: string }>()
const gameName = computed(() => config.games.find((g) => g.id === props.gameId)?.name ?? props.gameId)
const base = computed(() => `/api/admin/categories/${props.gameId}`)
const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Items', key: 'count' },
  { title: 'Created', key: 'createdAt' },
  { title: '', key: 'actions', sortable: false, align: 'end' as const },
]

const categories = ref<Category[]>([])
const loading = ref(false)

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T | null> {
  const res = await fetch(base.value + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) {
    toast(data.message ?? `Request failed (${res.status})`, 'error')
    return null
  }
  return data
}

async function load() {
  loading.value = true
  categories.value = (await call<{ categories: Category[] }>(''))?.categories ?? []
  loading.value = false
}
watch(() => props.gameId, load, { immediate: true })

const newName = ref('')
async function create() {
  const created = await call<Category>('', 'POST', { name: newName.value })
  if (created) {
    toast(`Added ${created.name}`, 'success')
    newName.value = ''
    await load()
  }
}

const renaming = ref<Category | null>(null)
const renameTo = ref('')
function openRename(category: Category) {
  renaming.value = category
  renameTo.value = category.name
}
async function rename() {
  const target = renaming.value!
  renaming.value = null
  if (await call(`/${target.id}`, 'PATCH', { name: renameTo.value })) await load()
}

async function remove(category: Category) {
  if (await call(`/${category.id}`, 'DELETE')) {
    toast(`Deleted ${category.name}`, 'success')
    await load()
  }
}
</script>
