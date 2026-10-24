/**
 * Static game registry (server side). Adding a game is one import and one entry.
 * The first entry is the default game for new rooms.
 */
import type { AnyGameModule } from '@wsfg/core/contract'
import { ballpark } from '@wsfg/game-ballpark/server'
import { colorMix } from '@wsfg/game-colormix/server'
import { dropLine } from '@wsfg/game-dropline/server'
import { flock } from '@wsfg/game-flock/server'
import { imposter } from '@wsfg/game-imposter/server'
import { liarsDice } from '@wsfg/game-liarsdice/server'
import { ticTacToe } from '@wsfg/game-tictactoe/server'

export const games: readonly AnyGameModule[] = [imposter, liarsDice, flock, colorMix, ticTacToe, dropLine, ballpark]
