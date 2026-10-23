import { defineGameClient } from '@wsfg/core/client'
import { meta, type ColorMixSettings, type ColorMixView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const colorMixClient = defineGameClient<ColorMixView, ColorMixSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  needsAction,
})
