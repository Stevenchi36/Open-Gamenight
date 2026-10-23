/**
 * Static game registry (server side). Adding a game is one import and one entry.
 * The first entry is the default game for new rooms.
 */
import type { AnyGameModule } from '@wsfg/core/contract'
import { herd } from '@wsfg/game-herd/server'
import { imposter } from '@wsfg/game-imposter/server'
import { liarsDice } from '@wsfg/game-liarsdice/server'

export const games: readonly AnyGameModule[] = [imposter, liarsDice, herd]
