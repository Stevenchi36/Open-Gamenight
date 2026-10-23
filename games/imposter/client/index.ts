import { defineGameClient } from '@wsfg/core/client'
import { meta, type ImposterSettings, type ImposterView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const imposterClient = defineGameClient<ImposterView, ImposterSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  adminPages: [{ path: 'words', title: 'Word library', component: () => import('./admin/WordsPage.vue') }],
  needsAction,
})
