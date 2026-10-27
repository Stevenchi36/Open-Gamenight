/**
 * Static game registry (server side). Adding a game is one import and one entry.
 * The first entry is the default game for new rooms.
 */
import type { AnyGameModule } from '@wsfg/core/contract'
import { ballpark } from '@wsfg/game-ballpark/server'
import { cheat } from '@wsfg/game-cheat/server'
import { colorMix } from '@wsfg/game-colormix/server'
import { dropLine } from '@wsfg/game-dropline/server'
import { dotsAndBoxes } from '@wsfg/game-dotsandboxes/server'
import { flock } from '@wsfg/game-flock/server'
import { goneFishin } from '@wsfg/game-gonefishin/server'
import { imposter } from '@wsfg/game-imposter/server'
import { inOrder } from '@wsfg/game-inorder/server'
import { lastCard } from '@wsfg/game-lastcard/server'
import { liarsDice } from '@wsfg/game-liarsdice/server'
import { oldMaid } from '@wsfg/game-oldmaid/server'
import { ticTacToe } from '@wsfg/game-tictactoe/server'

export const games: readonly AnyGameModule[] = [imposter, liarsDice, flock, colorMix, ticTacToe, dropLine, ballpark, goneFishin, lastCard, inOrder, cheat, dotsAndBoxes, oldMaid]
