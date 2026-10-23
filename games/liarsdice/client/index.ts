import type { GameClientModule } from '@wsfg/core/client'
import { meta } from '../shared/index.ts'
import { needsAction } from './attention.ts'

export const liarsDiceClient: GameClientModule = {
  ...meta,
  PlayView: () => import('./PlayView.vue'),
  SettingsView: () => import('./SettingsView.vue'),
  rules: () => import('../RULES.md?raw').then((m) => m.default),
  needsAction,
}
