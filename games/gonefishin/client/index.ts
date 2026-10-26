import { defineGameClient } from '@wsfg/core/client'
import { meta, type GoneFishinSettings, type GoneFishinView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const goneFishinClient = defineGameClient<GoneFishinView, GoneFishinSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  SpectatorView: () => import('./SpectatorView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  needsAction,
})
