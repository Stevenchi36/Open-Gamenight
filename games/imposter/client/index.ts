import type { GameClientModule } from '@wsfg/core/client'
import { GAME_ID } from '../shared/index.ts'

export const imposterClient: GameClientModule = {
  id: GAME_ID,
  name: 'Word Imposter',
  description: 'Everyone gets the secret word except the imposter. Give clues, find the faker.',
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  adminPages: [{ path: 'words', title: 'Word library', component: () => import('./admin/WordsPage.vue') }],
}
