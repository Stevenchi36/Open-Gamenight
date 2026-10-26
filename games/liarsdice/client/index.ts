import { defineGameClient } from '@wsfg/core/client'
import { meta, type LiarsDiceSettings, type LiarsDiceView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const liarsDiceClient = defineGameClient<LiarsDiceView, LiarsDiceSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SpectatorView: () => import('./SpectatorView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  needsAction,
})
