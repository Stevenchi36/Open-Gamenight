import { defineGameClient } from '@ogn/core/client'
import { meta, type DropLineSettings, type DropLineView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const dropLineClient = defineGameClient<DropLineView, DropLineSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  SpectatorView: () => import('./SpectatorView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  needsAction,
})
