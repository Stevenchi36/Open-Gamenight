import type { GameClientModule } from '@wsfg/core/client'
import { GAME_ID } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const imposterClient: GameClientModule = {
  id: GAME_ID,
  name: 'Word Imposter',
  description: 'Everyone gets the secret word except the imposter. Give clues, find the faker.',
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  adminPages: [{ path: 'words', title: 'Word library', component: () => import('./admin/WordsPage.vue') }],
  needsAction,
}
