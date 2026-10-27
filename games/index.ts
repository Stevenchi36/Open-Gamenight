/**
 * Static game registry (server side). Adding a game is one import and one entry.
 * The first entry is the default game for new rooms.
 */
import type { AnyGameModule } from '@ogn/core/contract'
import { ballpark } from '@ogn/game-ballpark/server'
import { cheat } from '@ogn/game-cheat/server'
import { colorMix } from '@ogn/game-colormix/server'
import { dropLine } from '@ogn/game-dropline/server'
import { dotsAndBoxes } from '@ogn/game-dotsandboxes/server'
import { flock } from '@ogn/game-flock/server'
import { goneFishin } from '@ogn/game-gonefishin/server'
import { imposter } from '@ogn/game-imposter/server'
import { inOrder } from '@ogn/game-inorder/server'
import { lastCard } from '@ogn/game-lastcard/server'
import { liarsDice } from '@ogn/game-liarsdice/server'
import { oldMaid } from '@ogn/game-oldmaid/server'
import { ticTacToe } from '@ogn/game-tictactoe/server'

export const games: readonly AnyGameModule[] = [imposter, liarsDice, flock, colorMix, ticTacToe, dropLine, ballpark, goneFishin, lastCard, inOrder, cheat, dotsAndBoxes, oldMaid]
