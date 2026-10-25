/**
 * Static game registry (client side). Same order as games/index.ts.
 * Each module lazy-loads its views, so a game's code is only fetched when played.
 */
import type { GameClientModule } from '@wsfg/core/client'
import { ballparkClient } from '@wsfg/game-ballpark/client'
import { cheatClient } from '@wsfg/game-cheat/client'
import { colorMixClient } from '@wsfg/game-colormix/client'
import { dropLineClient } from '@wsfg/game-dropline/client'
import { flockClient } from '@wsfg/game-flock/client'
import { goneFishinClient } from '@wsfg/game-gonefishin/client'
import { imposterClient } from '@wsfg/game-imposter/client'
import { inOrderClient } from '@wsfg/game-inorder/client'
import { lastCardClient } from '@wsfg/game-lastcard/client'
import { liarsDiceClient } from '@wsfg/game-liarsdice/client'
import { ticTacToeClient } from '@wsfg/game-tictactoe/client'

export const clientGames: readonly GameClientModule[] = [imposterClient, liarsDiceClient, flockClient, colorMixClient, ticTacToeClient, dropLineClient, ballparkClient, goneFishinClient, lastCardClient, inOrderClient, cheatClient]
