<template>
  <div>
    <div class="d-flex align-center flex-wrap ga-2 mb-4">
      <h1 class="text-h5">Word library</h1>
      <v-spacer />
      <v-btn variant="tonal" prepend-icon="mdi-plus" @click="openAdd">Add word</v-btn>
      <v-btn v-if="aiEnabled" color="primary" prepend-icon="mdi-creation" @click="openGenerate()">Generate</v-btn>
    </div>

    <v-alert v-for="c in lowStock" :key="c.category" type="warning" variant="tonal" density="compact" class="mb-2">
      Running low on {{ c.category }}: {{ c.unused }} unused word{{ c.unused === 1 ? '' : 's' }} left.
      <template v-if="aiEnabled" #append>
        <v-btn size="small" variant="text" @click="openGenerate(c.category)">Generate more</v-btn>
      </template>
    </v-alert>

    <v-card class="mb-4">
      <v-card-text class="d-flex flex-wrap ga-2">
        <v-chip
          v-for="c in categories"
          :key="c.category"
          :color="filter.category === c.category ? 'primary' : c.runningLow ? 'warning' : undefined"
          :variant="filter.category === c.category ? 'flat' : 'tonal'"
          @click="toggleCategory(c.category)"
        >
          {{ c.category }} <span class="ml-1 text-caption">{{ c.unused }}/{{ c.total }}</span>
        </v-chip>
        <span v-if="categories.length === 0" class="text-medium-emphasis">The library is empty; games use the built-in words until you add some.</span>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-text class="d-flex flex-wrap ga-2 align-center">
        <v-text-field
          v-model="filter.q"
          label="Search words and hints"
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
      </v-card-text>
      <v-data-table-server
        v-model="selected"
        v-model:items-per-page="itemsPerPage"
        v-model:page="page"
        :headers="headers"
        :items="words"
        :items-length="total"
        :loading="loading"
        item-value="id"
        show-select
        density="comfortable"
        @update:options="load"
      >
        <template #[`item.difficulty`]="{ item }">
          <v-chip size="x-small" variant="tonal">{{ item.difficulty }}</v-chip>
        </template>
        <template #[`item.times_used`]="{ item }">{{ item.times_used || '-' }}</template>
      </v-data-table-server>
    </v-card>

    <v-dialog v-model="adding" max-width="460">
      <v-card title="Add a word">
        <v-card-text>
          <v-combobox v-model="draft.category" :items="categoryNames" label="Category" />
          <v-text-field v-model="draft.word" label="Word" maxlength="29" counter />
          <v-text-field v-model="draft.hint" label="Hint for the imposter" hint="Vague; must not contain the word" persistent-hint maxlength="119" />
          <v-select v-model="draft.difficulty" :items="difficulties" label="Difficulty" class="mt-2" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="adding = false">Cancel</v-btn>
          <v-btn color="primary" :disabled="!draft.category || !draft.word || !draft.hint" @click="saveDraft">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="generating" max-width="900" scrollable>
      <v-card>
        <v-card-title>Generate words</v-card-title>
        <v-card-text>
          <div v-if="!candidates" class="d-flex flex-wrap ga-3 align-center">
            <v-combobox v-model="gen.category" :items="categoryNames" label="Category (empty = mixed)" clearable style="min-width: 220px" />
            <v-select v-model="gen.difficulty" :items="[{ title: 'Mixed', value: null }, ...difficulties.map((d) => ({ title: d, value: d }))]" label="Difficulty" style="max-width: 160px" />
            <v-text-field v-model.number="gen.count" type="number" min="1" max="50" label="How many" style="max-width: 120px" />
            <div class="text-caption text-medium-emphasis w-100">Nothing is saved until you review the results.</div>
          </div>
          <template v-else>
            <v-alert v-if="skippedCount" type="info" variant="tonal" density="compact" class="mb-3">
              {{ skippedCount }} result{{ skippedCount === 1 ? ' was' : 's were' }} dropped (duplicates or hints that gave the word away).
            </v-alert>
            <v-table density="compact">
              <thead>
                <tr><th style="width: 40px" /><th>Category</th><th>Word</th><th>Hint</th><th>Difficulty</th></tr>
              </thead>
              <tbody>
                <tr v-for="(c, i) in candidates" :key="i" :class="c.keep ? '' : 'text-disabled'">
                  <td><v-checkbox-btn v-model="c.keep" /></td>
                  <td><v-text-field v-model="c.category" density="compact" variant="plain" hide-details /></td>
                  <td><v-text-field v-model="c.word" density="compact" variant="plain" hide-details /></td>
                  <td><v-text-field v-model="c.hint" density="compact" variant="plain" hide-details /></td>
                  <td>
                    <v-select v-model="c.difficulty" :items="difficulties" density="compact" variant="plain" hide-details />
                  </td>
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

    <v-snackbar v-model="snack.show" :color="snack.color" timeout="5000">{{ snack.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

type Difficulty = 'easy' | 'medium' | 'hard'
interface WordRow {
  id: number
  category: string
  word: string
  hint: string
  difficulty: Difficulty
  source: string
  times_used: number
}
interface Category {
  category: string
  total: number
  unused: number
  runningLow: boolean
}
interface Candidate {
  category: string
  word: string
  hint: string
  difficulty: Difficulty
  keep: boolean
}

const BASE = '/api/admin/imposter'
const difficulties: Difficulty[] = ['easy', 'medium', 'hard']
const headers = [
  { title: 'Word', key: 'word', sortable: false },
  { title: 'Category', key: 'category', sortable: false },
  { title: 'Hint', key: 'hint', sortable: false },
  { title: 'Difficulty', key: 'difficulty', sortable: false },
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
const lowStock = computed(() => categories.value.filter((c) => c.runningLow))
const categoryNames = computed(() => categories.value.map((c) => c.category))
async function loadCategories() {
  const data = await api<{ categories: Category[]; aiEnabled: boolean }>('/categories')
  categories.value = data.categories
  aiEnabled.value = data.aiEnabled
}

// ---- table
const words = ref<WordRow[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(25)
const selected = ref<number[]>([])
const filter = reactive({ category: null as string | null, q: '' as string | null })

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams({ limit: String(itemsPerPage.value), offset: String((page.value - 1) * itemsPerPage.value) })
    if (filter.category) params.set('category', filter.category)
    if (filter.q) params.set('q', filter.q)
    const data = await api<{ total: number; words: WordRow[] }>(`/words?${params}`)
    words.value = data.words
    total.value = data.total
  } catch (error) {
    notify((error as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

let debounce: ReturnType<typeof setTimeout> | undefined
watch(
  () => [filter.category, filter.q],
  () => {
    clearTimeout(debounce)
    debounce = setTimeout(() => {
      page.value = 1
      void load()
    }, 250)
  },
)
function toggleCategory(category: string) {
  filter.category = filter.category === category ? null : category
}

async function refresh() {
  await Promise.all([loadCategories(), load()])
}
onMounted(() => void loadCategories().catch((e: Error) => notify(e.message, 'error')))

async function removeSelected() {
  try {
    const { removed } = await api<{ removed: number }>('/words', { method: 'DELETE', body: { ids: selected.value } })
    selected.value = []
    notify(`Deleted ${removed} word${removed === 1 ? '' : 's'}`)
    await refresh()
  } catch (error) {
    notify((error as Error).message, 'error')
  }
}

// ---- add one
const adding = ref(false)
const draft = reactive({ category: '' as string | null, word: '', hint: '', difficulty: 'medium' as Difficulty })
function openAdd() {
  Object.assign(draft, { category: filter.category ?? '', word: '', hint: '', difficulty: 'medium' })
  adding.value = true
}
async function saveDraft() {
  try {
    const result = await api<{ inserted: number; skipped: { reason: string }[] }>('/words', {
      method: 'POST',
      body: { words: [{ ...draft, category: draft.category ?? '' }], source: 'manual' },
    })
    if (result.inserted) {
      adding.value = false
      notify(`Added ${draft.word}`)
      await refresh()
    } else {
      notify(result.skipped[0]?.reason ?? 'Not added', 'warning')
    }
  } catch (error) {
    notify((error as Error).message, 'error')
  }
}

// ---- generate -> review -> save
const generating = ref(false)
const busy = ref(false)
const gen = reactive({ category: null as string | null, difficulty: null as Difficulty | null, count: 20 })
const candidates = ref<Candidate[] | null>(null)
const skippedCount = ref(0)
const keepCount = computed(() => candidates.value?.filter((c) => c.keep).length ?? 0)

function openGenerate(category: string | null = filter.category) {
  gen.category = category
  candidates.value = null
  generating.value = true
}
async function generate() {
  busy.value = true
  try {
    const result = await api<{ candidates: Omit<Candidate, 'keep'>[]; skipped: unknown[] }>('/words/generate', {
      method: 'POST',
      body: { count: gen.count, category: gen.category || null, difficulty: gen.difficulty },
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
  const keep = (candidates.value ?? []).filter((c) => c.keep).map(({ keep: _keep, ...word }) => word)
  try {
    const result = await api<{ inserted: number; skipped: { word: string; reason: string }[] }>('/words', {
      method: 'POST',
      body: { words: keep, source: 'claude' },
    })
    generating.value = false
    notify(
      `Saved ${result.inserted} word${result.inserted === 1 ? '' : 's'}` +
        (result.skipped.length ? ` (${result.skipped.length} skipped: ${result.skipped[0]!.reason})` : ''),
      result.skipped.length ? 'warning' : 'success',
    )
    await refresh()
  } catch (error) {
    notify((error as Error).message, 'error')
  }
}
</script>
