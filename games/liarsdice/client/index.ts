import type { GameClientModule } from '@wsfg/core/client'
import { GAME_ID } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const liarsDiceClient: GameClientModule = {
  id: GAME_ID,
  name: "Liar's Dice",
  description: 'Roll in secret, bid on what everyone holds, and call out the liars.',
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  needsAction,
}
