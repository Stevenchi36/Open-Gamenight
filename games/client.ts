/**
 * Static game registry (client side). Same order as games/index.ts.
 * Each module lazy-loads its views, so a game's code is only fetched when played.
 */
import type { GameClientModule } from '@wsfg/core/client'
import { herdClient } from '@wsfg/game-herd/client'
import { imposterClient } from '@wsfg/game-imposter/client'
import { liarsDiceClient } from '@wsfg/game-liarsdice/client'

export const clientGames: readonly GameClientModule[] = [imposterClient, liarsDiceClient, herdClient]
