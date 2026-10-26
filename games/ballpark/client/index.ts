import { defineGameClient } from '@wsfg/core/client'
import { meta, type BallparkSettings, type BallparkView } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const ballparkClient = defineGameClient<BallparkView, BallparkSettings>({
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SpectatorView: () => import('./SpectatorView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  adminPages: [{ path: 'questions', title: 'Question library', component: () => import('./admin/QuestionsPage.vue') }],
  needsAction,
})
