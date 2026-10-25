<template>
  <div>
    <div class="d-flex align-center flex-wrap ga-2 mb-4">
      <h1 class="text-h5">Theme library</h1>
      <v-spacer />
      <v-btn variant="text" prepend-icon="mdi-shape-outline" :to="{ name: 'admin-categories', params: { gameId: 'inorder' } }">
        Categories
      </v-btn>
      <v-btn variant="tonal" prepend-icon="mdi-plus" @click="openAdd">Add theme</v-btn>
      <v-btn v-if="aiEnabled" color="primary" prepend-icon="mdi-creation" @click="openGenerate()">Generate</v-btn>
    </div>

    <v-alert v-for="c in lowStock" :key="c.category" type="warning" variant="tonal" density="compact" class="mb-2">
      Running low on {{ c.category }}: {{ c.unused }} unused theme{{ c.unused === 1 ? '' : 's' }} left.
      <template v-if="aiEnabled" #append>
        <v-btn size="small" variant="text" @click="openGenerate(c.category)">Generate more</v-btn>
      </template>
    </v-alert>

    <v-alert v-if="categories.length === 0" type="info" variant="tonal" density="compact" class="mb-4">
      No categories yet. Add a theme with a new category name, set some up under Categories, or generate themes into a new one. Until the library has themes, games use
      the starter list.
    </v-alert>

    <v-card>
      <v-card-text class="d-flex flex-wrap ga-2 align-center">
        <v-autocomplete
          v-model="filter.categoryId"
          :items="categories"
          item-title="category"
          item-value="id"
          label="Category"
          placeholder="All categories"
          persistent-placeholder
          prepend-inner-icon="mdi-shape-outline"
          clearable
          hide-details
          density="compact"
          style="max-width: 280px; min-width: 200px"
        >
          <template #item="{ props: itemProps, item }">
            <v-list-item v-bind="itemProps" :title="item.category">
              <template #append>
                <span class="text-caption text-medium-emphasis">{{ item.unused }}/{{ item.total }} unused</span>
              </template>
            </v-list-item>
          </template>
        </v-autocomplete>
        <v-text-field
          v-model="filter.q"
          label="Search themes"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
          density="compact"
          style="max-width: 320px"
        />
        <v-spacer />
        <v-btn v-if="selected.length" color="error" variant="tonal" prepend-icon="mdi-delete" @click="removeSelected">
          Delete {{ selected.length }}
        </v-btn>
        <v-btn v-else-if="usedCount" variant="text" prepend-icon="mdi-broom" @click="clearing = true">Clear used</v-btn>
      </v-card-text>
      <v-data-table-server
        v-model="selected"
        v-model:items-per-page="itemsPerPage"
        v-model:page="page"
        :headers="headers"
        :items="themes"
        :items-length="total"
        :loading="loading"
        item-value="id"
        show-select
        density="comfortable"
        hover
        @update:options="load"
        @click:row="(_e: unknown, row: { item: ThemeRow }) => openEdit(row.item)"
      >
        <template #[`item.scale`]="{ item }">{{ item.low }} → {{ item.high }}</template>
        <template #[`item.times_used`]="{ item }">{{ item.times_used || '-' }}</template>
      </v-data-table-server>
    </v-card>

    <v-dialog v-model="adding" max-width="520">
      <v-card title="Add a theme">
        <v-card-text>
          <v-combobox v-model="draft.category" :items="categoryNames" label="Category" hint="Pick one, or type a new name" persistent-hint class="mb-2" />
          <v-text-field
            v-model="draft.theme"
            label="Theme"
            hint='A scale everyone can picture, e.g. "How scary is it?"'
            persistent-hint
            maxlength="80"
            counter
            class="mb-2"
          />
          <div class="d-flex ga-2">
            <v-text-field v-model="draft.low" label="1 means" placeholder="Not scary at all" maxlength="30" />
            <v-text-field v-model="draft.high" label="100 means" placeholder="Terrifying" maxlength="30" />
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="adding = false">Cancel</v-btn>
          <v-btn color="primary" :disabled="!draft.category?.trim() || !draft.theme || !draft.low || !draft.high" @click="saveDraft">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="!!editing" max-width="520" @update:model-value="editing = null">
      <v-card title="Edit theme">
        <v-card-text>
          <v-select v-model="edit.categoryId" :items="categories" item-title="category" item-value="id" label="Category" />
          <v-text-field v-model="edit.theme" label="Theme" maxlength="80" counter />
          <div class="d-flex ga-2">
            <v-text-field v-model="edit.low" label="1 means" maxlength="30" />
            <v-text-field v-model="edit.high" label="100 means" maxlength="30" />
          </div>
          <div v-if="editing" class="text-caption text-medium-emphasis">
            Source: {{ editing.source }} · used {{ editing.times_used }} time{{ editing.times_used === 1 ? '' : 's' }}
          </div>
        </v-card-text>
        <v-card-actions>
          <v-btn color="error" variant="text" prepend-icon="mdi-delete" @click="deleteEditing">Delete</v-btn>
          <v-spacer />
          <v-btn @click="editing = null">Cancel</v-btn>
          <v-btn color="primary" :disabled="!edit.theme || !edit.low || !edit.high" @click="saveEdit">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="generating" max-width="800" scrollable>
      <v-card>
        <v-card-title>Generate themes</v-card-title>
        <v-card-text>
          <div v-if="!candidates" class="d-flex flex-wrap ga-3 align-center">
            <v-combobox v-model="gen.category" :items="categoryNames" label="Category (empty: mixed, or as the instructions say)" clearable style="min-width: 220px" />
            <v-text-field v-model.number="gen.count" type="number" min="1" max="50" label="How many" style="max-width: 120px" />
            <v-textarea
              v-model="gen.instructions"
              label="Extra instructions (optional)"
              placeholder="e.g. Really easy, for young kids"
              rows="2"
              auto-grow
              maxlength="500"
              counter
              class="w-100"
            />
            <div class="text-caption text-medium-emphasis w-100">Nothing is saved until you review the results.</div>
          </div>
          <template v-else>
            <v-alert v-if="skippedCount" type="info" variant="tonal" density="compact" class="mb-3">
              {{ skippedCount }} result{{ skippedCount === 1 ? ' was' : 's were' }} dropped (duplicates or invalid).
            </v-alert>
            <v-table density="compact">
              <thead>
                <tr><th style="width: 40px" /><th style="width: 20%">Category</th><th>Theme</th><th style="width: 20%">1 means</th><th style="width: 20%">100 means</th></tr>
              </thead>
              <tbody>
                <tr v-for="(c, i) in candidates" :key="i" :class="c.keep ? '' : 'text-disabled'">
                  <td><v-checkbox-btn v-model="c.keep" /></td>
                  <td><v-text-field v-model="c.category" density="compact" variant="plain" hide-details /></td>
                  <td><v-text-field v-model="c.theme" density="compact" variant="plain" hide-details /></td>
                  <td><v-text-field v-model="c.low" density="compact" variant="plain" hide-details /></td>
                  <td><v-text-field v-model="c.high" density="compact" variant="plain" hide-details /></td>
                </tr>
              </tbody>
            </v-table>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-btn v-if="candidates" variant="text" @click="candidates = null">Back</v-btn>
          <v-spacer />
          <v-btn @click="generating = false">Cancel</v-btn>
          <v-btn v-if="!candidates" color="primary" :loading="busy" :disabled="!(gen.count >= 1 && gen.count <= 50)" @click="generate">
            Generate
          </v-btn>
          <v-btn v-else color="primary" :disabled="!keepCount" @click="saveCandidates">Save {{ keepCount }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="clearing" max-width="420">
      <v-card :title="`Clear used themes${filter.categoryId ? ` in ${nameOf(filter.categoryId)}` : ''}?`">
        <v-card-text>
          Deletes the {{ usedCount }} theme{{ usedCount === 1 ? '' : 's' }} that {{ usedCount === 1 ? 'has' : 'have' }} been played at least once{{
            filter.categoryId ? '' : ', in every category'
          }}. This can't be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="clearing = false">Cancel</v-btn>
          <v-btn color="error" @click="clearUsed">Delete {{ usedCount }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="5000">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

interface ThemeRow {
  id: number
  category_id: number
  category: string
  theme: string
  low: string
  high: string
  source: string
  times_used: number
}
interface Category {
  id: number
  category: string
  total: number
  unused: number
  runningLow: boolean
}
interface Candidate {
  category: string
  theme: string
  low: string
  high: string
  keep: boolean
}

const BASE = '/api/admin/inorder'
const headers = [
  { title: 'Theme', key: 'theme', sortable: false },
  { title: '1 → 100', key: 'scale', sortable: false },
  { title: 'Category', key: 'category', sortable: false },
  { title: 'Used', key: 'times_used', sortable: false },
]

const snack = reactive({ show: false, text: '', color: 'success' })
const notify = (text: string, color = 'success') => Object.assign(snack, { show: true, text, color })

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method: init.method ?? 'GET',
    headers: init.body ? { 'content-type': 'application/json' } : {},
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(data.message ?? `Request failed (${res.status})`)
  return data
}

// ---- categories
const categories = ref<Category[]>([])
const aiEnabled = ref(false)
const lowStock = computed(() => categories.value.filter((c) => c.runningLow && c.total > 0))
const categoryNames = computed(() => categories.value.map((c) => c.category))
async function loadCategories() {
  const data = await api<{ categories: Category[]; aiEnabled: boolean }>('/categories')
  categories.value = data.categories
  aiEnabled.value = data.aiEnabled
}

// ---- table
const themes = ref<ThemeRow[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(25)
const selected = ref<number[]>([])
const filter = reactive({ categoryId: null as number | null, q: '' as string | null })

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams({ limit: String(itemsPerPage.value), offset: String((page.value - 1) * itemsPerPage.value) })
    if (filter.categoryId) params.set('categoryId', String(filter.categoryId))
    if (filter.q) params.set('q', filter.q)
    const data = await api<{ total: number; themes: ThemeRow[] }>(`/themes?${params}`)
    themes.value = data.themes
    total.value = data.total
  } catch (error) {
    notify((error as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch(
  () => [filter.categoryId, filter.q],
  () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      page.value = 1
      void load()
    }, 250)
  },
)
const nameOf = (id: number | null) => categories.value.find((c) => c.id === id)?.category ?? null

async function refresh() {
  await Promise.all([loadCategories(), load()])
}
onMounted(() => void loadCategories().catch((e: Error) => notify(e.message, 'error')))

async function removeSelected() {
  try {
    const { removed } = await api<{ removed: number }>('/themes', { method: 'DELETE', body: { ids: selected.value } })
    selected.value = []
    notify(`Deleted ${removed} theme${removed === 1 ? '' : 's'}`)
    await refresh()
  } catch (error) {
    notify((error as Error).message, 'error')
  }
}

// ---- clear used: delete everything already played, in the filtered category or all of them
const clearing = ref(false)
const usedCount = computed(() =>
  categories.value.filter((c) => !filter.categoryId || c.id === filter.categoryId).reduce((n, c) => n + c.total - c.unused, 0),
)
async function clearUsed() {
  clearing.value = false
  try {
    const { removed } = await api<{ removed: number }>('/themes/used', { method: 'DELETE', body: { categoryId: filter.categoryId } })
    notify(`Deleted ${removed} used theme${removed === 1 ? '' : 's'}`)
    await refresh()
  } catch (error) {
    notify((error as Error).message, 'error')
  }
}

// ---- add one
const adding = ref(false)
const draft = reactive({ category: '' as string | null, theme: '', low: '', high: '' })
function openAdd() {
  Object.assign(draft, { category: nameOf(filter.categoryId) ?? categories.value[0]?.category ?? '', theme: '', low: '', high: '' })
  adding.value = true
}
async function saveDraft() {
  try {
    const result = await api<{ inserted: number; skipped: { reason: string }[] }>('/themes', {
      method: 'POST',
      body: { themes: [{ category: draft.category?.trim() ?? '', theme: draft.theme, low: draft.low, high: draft.high }], source: 'manual' },
    })
    if (result.inserted) {
      adding.value = false
      notify('Theme added')
      await refresh()
    } else {
      notify(result.skipped[0]?.reason ?? 'Not added', 'warning')
    }
  } catch (error) {
    notify((error as Error).message, 'error')
  }
}

// ---- edit / move one theme
const editing = ref<ThemeRow | null>(null)
const edit = reactive({ categoryId: 0, theme: '', low: '', high: '' })
function openEdit(row: ThemeRow) {
  editing.value = row
  Object.assign(edit, { categoryId: row.category_id, theme: row.theme, low: row.low, high: row.high })
}
async function saveEdit() {
  const row = editing.value!
  try {
    await api(`/themes/${row.id}`, { method: 'PATCH', body: { ...edit } })
    editing.value = null
    notify('Theme saved')
    await refresh()
  } catch (error) {
    notify((error as Error).message, 'error')
  }
}
async function deleteEditing() {
  const row = editing.value!
  editing.value = null
  selected.value = [row.id]
  await removeSelected()
}

// ---- generate -> review -> save
const generating = ref(false)
const busy = ref(false)
const gen = reactive({ category: null as string | null, count: 20, instructions: '' })
const candidates = ref<Candidate[] | null>(null)
const skippedCount = ref(0)
const keepCount = computed(() => candidates.value?.filter((c) => c.keep).length ?? 0)

function openGenerate(category: string | null = nameOf(filter.categoryId)) {
  gen.category = category
  candidates.value = null
  generating.value = true
}
async function generate() {
  busy.value = true
  try {
    const result = await api<{ candidates: Omit<Candidate, 'keep'>[]; skipped: unknown[] }>('/themes/generate', {
      method: 'POST',
      body: { count: gen.count, category: gen.category || null, instructions: gen.instructions.trim() || null },
    })
    candidates.value = result.candidates.map((c) => ({ ...c, keep: true }))
    skippedCount.value = result.skipped.length
  } catch (error) {
    notify((error as Error).message, 'error')
  } finally {
    busy.value = false
  }
}
async function saveCandidates() {
  const keep = (candidates.value ?? []).filter((c) => c.keep).map(({ keep: _keep, ...theme }) => theme)
  try {
    const result = await api<{ inserted: number; skipped: { reason: string }[] }>('/themes', {
      method: 'POST',
      body: { themes: keep, source: 'claude' },
    })
    generating.value = false
    notify(
      `Saved ${result.inserted} theme${result.inserted === 1 ? '' : 's'}` +
        (result.skipped.length ? ` (${result.skipped.length} skipped: ${result.skipped[0]!.reason})` : ''),
      result.skipped.length ? 'warning' : 'success',
    )
    await refresh()
  } catch (error) {
    notify((error as Error).message, 'error')
  }
}
</script>
