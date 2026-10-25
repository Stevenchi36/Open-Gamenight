import { defineGameClient } from '@wsfg/core/client'
import { meta, type CheatSettings, type CheatView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const cheatClient = defineGameClient<CheatView, CheatSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  needsAction,
})
