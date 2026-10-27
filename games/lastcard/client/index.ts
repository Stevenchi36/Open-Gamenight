import { defineGameClient } from '@ogn/core/client'
import { meta, type LastCardSettings, type LastCardView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const lastCardClient = defineGameClient<LastCardView, LastCardSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  SpectatorView: () => import('./SpectatorView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  needsAction,
})
