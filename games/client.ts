/**
 * Static game registry (client side). Same order as games/index.ts.
 * Each module lazy-loads its views, so a game's code is only fetched when played.
 */
import type { GameClientModule } from '@ogn/core/client'
import { ballparkClient } from '@ogn/game-ballpark/client'
import { cheatClient } from '@ogn/game-cheat/client'
import { colorMixClient } from '@ogn/game-colormix/client'
import { dropLineClient } from '@ogn/game-dropline/client'
import { dotsAndBoxesClient } from '@ogn/game-dotsandboxes/client'
import { flockClient } from '@ogn/game-flock/client'
import { goneFishinClient } from '@ogn/game-gonefishin/client'
import { imposterClient } from '@ogn/game-imposter/client'
import { inOrderClient } from '@ogn/game-inorder/client'
import { lastCardClient } from '@ogn/game-lastcard/client'
import { liarsDiceClient } from '@ogn/game-liarsdice/client'
import { oldMaidClient } from '@ogn/game-oldmaid/client'
import { ticTacToeClient } from '@ogn/game-tictactoe/client'

export const clientGames: readonly GameClientModule[] = [imposterClient, liarsDiceClient, flockClient, colorMixClient, ticTacToeClient, dropLineClient, ballparkClient, goneFishinClient, lastCardClient, inOrderClient, cheatClient, dotsAndBoxesClient, oldMaidClient]
