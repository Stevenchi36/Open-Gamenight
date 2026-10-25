import { defineGameClient } from '@wsfg/core/client'
import { meta, type InOrderSettings, type InOrderView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const inOrderClient = defineGameClient<InOrderView, InOrderSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  adminPages: [{ path: 'themes', title: 'Theme library', component: () => import('./admin/ThemesPage.vue') }],
  needsAction,
})
