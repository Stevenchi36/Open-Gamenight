import type { PlayerId } from '@wsfg/core/contract'
import type { Rank } from '@wsfg/core/kit'
import type { Move } from '../shared/index.ts'

const NAMES: Record<Rank, [string, string]> = {
  A: ['ace', 'aces'],
  '2': ['two', 'twos'],
  '3': ['three', 'threes'],
  '4': ['four', 'fours'],
  '5': ['five', 'fives'],
  '6': ['six', 'sixes'],
  '7': ['seven', 'sevens'],
  '8': ['eight', 'eights'],
  '9': ['nine', 'nines'],
  '10': ['ten', 'tens'],
  J: ['jack', 'jacks'],
  Q: ['queen', 'queens'],
  K: ['king', 'kings'],
}

/** "sevens"; "seven" with `count` 1. */
export function rankName(rank: Rank, count = 2): string {
  return NAMES[rank][count === 1 ? 0 : 1]
}

const NUMBERS = ['no', 'one', 'two', 'three']

/**
 * One move as a sentence, from the viewer's side: "You asked Bea for sevens and got two."
 * `name` turns an id into a display name (the viewer reads as "You"/"you").
 */
export function moveText(move: Move, me: PlayerId, name: (id: PlayerId) => string): string {
  const asker = move.askerId === me ? 'You' : name(move.askerId)
  const books = move.books.length > 0 ? ` Book of ${move.books.map((r) => rankName(r)).join(' and ')}!` : ''
  if (move.targetId === null || move.rank === null) return `${asker} had nobody to ask, so ${move.askerId === me ? 'you' : 'they'} drew from the pond.${books}`

  const target = move.targetId === me ? 'you' : name(move.targetId)
  const asked = `${asker} asked ${target} for ${rankName(move.rank)}`
  if (move.given > 0) return `${asked} and got ${NUMBERS[move.given] ?? move.given}.${books}`
  if (!move.drew) return `${asked}. Gone fishin', but the pond is empty.`
  if (move.lucky) return `${asked}. Gone fishin'… and caught a ${rankName(move.rank, 1)}!${books}`
  return `${asked}. Gone fishin'!${books}`
}
