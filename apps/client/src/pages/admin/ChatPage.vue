<template>
  <div class="d-flex flex-column chat-page">
    <div class="d-flex align-center mb-4">
      <h1 class="text-h5">Assistant</h1>
      <v-spacer />
      <v-btn variant="text" prepend-icon="mdi-plus" :disabled="busy || !items.length" @click="newChat">New chat</v-btn>
    </div>

    <v-card class="flex-grow-1 d-flex flex-column">
      <div ref="scroller" class="flex-grow-1 overflow-y-auto pa-4 chat-log">
        <div v-if="!items.length" class="text-medium-emphasis">
          <p class="mb-3">Ask in plain words and Claude makes the changes to the game libraries for you. For example:</p>
          <div class="d-flex flex-wrap ga-2">
            <v-chip v-for="example in EXAMPLES" :key="example" variant="outlined" @click="draft = example">{{ example }}</v-chip>
          </div>
          <p class="text-caption mt-4">
            It can add, edit and remove categories, words and questions. Before removing anything it asks you to confirm.
          </p>
        </div>

        <template v-for="(item, i) in items" :key="i">
          <div v-if="item.kind === 'user'" class="d-flex justify-end mb-3">
            <div class="bubble bubble-user">{{ item.text }}</div>
          </div>
          <div v-else-if="item.kind === 'assistant'" class="d-flex mb-3">
            <div class="bubble bubble-assistant">{{ item.text }}</div>
          </div>
          <div v-else-if="item.kind === 'tool'" class="mb-2">
            <v-chip
              size="small"
              variant="tonal"
              :color="item.ok ? 'success' : 'warning'"
              :prepend-icon="item.ok ? 'mdi-check' : 'mdi-alert-outline'"
              :title="item.error"
            >
              {{ item.label }}
            </v-chip>
          </div>
          <v-alert v-else type="error" variant="tonal" density="compact" class="mb-3">{{ item.text }}</v-alert>
        </template>

        <div v-if="busy" class="d-flex align-center ga-2 text-medium-emphasis">
          <v-progress-circular indeterminate size="16" width="2" />
          Working...
        </div>
      </div>

      <v-divider />
      <div class="pa-3 d-flex align-end ga-2">
        <v-textarea
          v-model="draft"
          placeholder="What should I do? (Enter to send, Shift+Enter for a new line)"
          rows="1"
          max-rows="8"
          auto-grow
          hide-details
          variant="outlined"
          density="comfortable"
          :maxlength="MAX_LENGTH"
          @keydown.enter.exact.prevent="send"
        />
        <v-btn icon="mdi-send" color="primary" :disabled="busy || !draft.trim()" :loading="busy" @click="send" />
      </div>
    </v-card>
  </div>
</template>

<script setup lang="ts">
// The server runs the conversation (POST /api/admin/chat, admin-only); this page only shows it.
import { nextTick, onMounted, ref, watch } from 'vue'
import { load, remove, save } from '@wsfg/core/ui/storage'

type Item =
  | { kind: 'user' | 'assistant' | 'error'; text: string }
  | { kind: 'tool'; label: string; ok: boolean; error?: string }

/** One line of the server's NDJSON stream (ChatEvent in apps/server/src/chat.ts). */
type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; label: string; ok: boolean; error?: string }
  | { type: 'error'; message: string }
  | { type: 'done'; conversationId: string }

const STORAGE_KEY = 'adminChat'
const MAX_LENGTH = 4000
const EXAMPLES = [
  'Add 20 ocean animals to Word Imposter',
  'Which Ballpark categories are running low?',
  'Write 10 easy Flock questions about breakfast',
  'Rename the Imposter category Movie to Movies',
]

const saved = load<{ conversationId: string | null; items: Item[] }>(STORAGE_KEY)
const conversationId = ref<string | null>(saved?.conversationId ?? null)
const items = ref<Item[]>(saved?.items ?? [])
const draft = ref('')
const busy = ref(false)
const scroller = ref<HTMLElement | null>(null)

// Kept per browser so leaving the page doesn't lose the chat (the server drops it after 2 idle hours).
watch([conversationId, items], () => save(STORAGE_KEY, { conversationId: conversationId.value, items: items.value }), { deep: true })
watch(
  () => items.value.length + (busy.value ? 1 : 0),
  async () => {
    await nextTick()
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight })
  },
)
onMounted(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight }))

function newChat(): void {
  // Best effort: the server also drops chats after 2 idle hours.
  if (conversationId.value) void fetch(`/api/admin/chat/${encodeURIComponent(conversationId.value)}`, { method: 'DELETE' }).catch(() => {})
  conversationId.value = null
  items.value = []
  remove(STORAGE_KEY)
}

function apply(event: ChatEvent): void {
  if (event.type === 'text') items.value.push({ kind: 'assistant', text: event.text })
  else if (event.type === 'tool') items.value.push({ kind: 'tool', label: event.label, ok: event.ok, error: event.error })
  else if (event.type === 'error') items.value.push({ kind: 'error', text: event.message })
  else conversationId.value = event.conversationId
}

async function send(): Promise<void> {
  const message = draft.value.trim()
  if (!message || busy.value) return
  busy.value = true
  draft.value = ''
  items.value.push({ kind: 'user', text: message })
  try {
    const res = await fetch('/api/admin/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId: conversationId.value, message }),
    })
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      // An expired chat can't continue; the next message starts a new one.
      if (res.status === 404) conversationId.value = null
      items.value.push({ kind: 'error', text: body.message ?? `Request failed (${res.status})` })
      return
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line) apply(JSON.parse(line) as ChatEvent)
      }
    }
  } catch {
    items.value.push({ kind: 'error', text: 'Lost the connection. Anything already done stays done.' })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.chat-page {
  height: calc(100dvh - 140px);
  min-height: 420px;
}
.chat-log {
  min-height: 0;
}
.bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.bubble-user {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}
.bubble-assistant {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
</style>
