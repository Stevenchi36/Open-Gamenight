import { defineGameClient } from '@ogn/core/client'
import { meta, type FlockSettings, type FlockView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const flockClient = defineGameClient<FlockView, FlockSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SpectatorView: () => import('./SpectatorView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  adminPages: [{ path: 'questions', title: 'Question library', component: () => import('./admin/QuestionsPage.vue') }],
  needsAction,
})
