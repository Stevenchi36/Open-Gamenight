import type { GameClientModule } from '@wsfg/core/client'
import { meta } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const imposterClient: GameClientModule = {
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  adminPages: [{ path: 'words', title: 'Word library', component: () => import('./admin/WordsPage.vue') }],
  needsAction,
}
