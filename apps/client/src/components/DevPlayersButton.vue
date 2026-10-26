<template>
  <v-btn icon="mdi-account-multiple-plus-outline" aria-label="Dev players" @click="open = true" />
  <v-dialog v-model="open" max-width="380">
    <v-card title="Dev players" subtitle="Several players in one window">
      <v-card-text>
        <v-slider v-model="count" :min="2" :max="12" :step="1" label="Players" thumb-label hide-details class="mb-4">
          <template #append>
            <span class="text-body-large font-weight-medium" style="min-width: 2ch">{{ count }}</span>
          </template>
        </v-slider>
        <v-text-field v-model="code" label="Room code (optional)" maxlength="8" hide-details class="room-code" />
        <div class="text-body-small text-medium-emphasis mt-3">
          Opens in a new tab. P1 is signed in as you; if you're already in this room, P1 takes your seat from this
          tab.
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">Cancel</v-btn>
        <v-btn color="primary" prepend-icon="mdi-open-in-new" @click="launch">Open</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
/** Dev only (the shell renders it under import.meta.env.DEV): opens dev-players.html, the multi-player grid. */
import { ref, watch } from 'vue'
import { devPlayersUrl } from '../lib/dev-windows.ts'
import { roomState } from '../lib/room.ts'

const open = ref(false)
const count = ref(3)
const code = ref('')

// Default to the room this tab is in.
watch(open, (isOpen) => {
  if (isOpen) code.value = roomState.room?.code ?? code.value
})

function launch() {
  window.open(devPlayersUrl(count.value, code.value), '_blank')
  open.value = false
}
</script>
