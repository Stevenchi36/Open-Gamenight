import { defineGameClient } from '@wsfg/core/client'
import { meta, type OldMaidSettings, type OldMaidView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const oldMaidClient = defineGameClient<OldMaidView, OldMaidSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  SpectatorView: () => import('./SpectatorView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  needsAction,
})
