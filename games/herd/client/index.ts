import { defineGameClient } from '@wsfg/core/client'
import { meta, type HerdSettings, type HerdView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const herdClient = defineGameClient<HerdView, HerdSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  adminPages: [{ path: 'questions', title: 'Question library', component: () => import('./admin/QuestionsPage.vue') }],
  needsAction,
})
