import type { PlayerId } from '@wsfg/core/contract'
import type { Color, LcCard, Move } from '../shared/index.ts'

/** Card colours: fixed, since they're what's printed on the cards, and they read on light and dark. */
export const CARD_COLORS: Record<Color, string> = {
  red: '#d32f2f',
  yellow: '#f2b705',
  green: '#2e9d48',
  blue: '#1e6fd9',
}

const VALUE_NAMES: Partial<Record<LcCard['value'], string>> = {
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: 'Draw Two',
  wild: 'Wild',
  wild4: 'Wild Draw Four',
}

/** "red 7", "blue Skip", "Wild Draw Four". */
export function cardName(card: LcCard): string {
  const value = VALUE_NAMES[card.value] ?? card.value
  return card.color ? `${card.color} ${value}` : value
}

/**
 * One move as a sentence, from the viewer's side: "You played a red 7. Last card!"
 * `name` turns an id into a display name (the viewer reads as "You"/"you"); `sevenZero`
 * says whether a 0 passed every hand on.
 */
export function moveText(move: Move, me: PlayerId, name: (id: PlayerId) => string, sevenZero: boolean): string {
  const who = (id: PlayerId, start = false) => (id === me ? (start ? 'You' : 'you') : name(id))
  const actor = who(move.playerId, true)
  switch (move.kind) {
    case 'play': {
      // Every card name starts with a colour or "Wild", so it's always "a".
      let text = `${actor} ${move.jumpIn ? 'jumped in with' : 'played'} a ${cardName(move.card)}`
      if (move.card.color === null) text += ` and chose ${move.color}`
      text += '.'
      if (move.swapWith) text += ` Swapped hands with ${who(move.swapWith)}.`
      else if (sevenZero && move.card.value === '0') text += ' Every hand moved on.'
      if (move.called) text += ' Last card!'
      return text
    }
    case 'draw': {
      const cards = `${move.count} ${move.count === 1 ? 'card' : 'cards'}`
      if (move.away) return `${actor} ${move.playerId === me ? 'were' : 'was'} away, so drew ${cards}.`
      if (move.count === 0) return `${actor} had nothing left to draw.`
      return move.penalty ? `${actor} had to draw ${cards}.` : `${actor} drew ${cards}.`
    }
    case 'pass':
      return move.away ? `${actor} ${move.playerId === me ? 'were' : 'was'} away, so kept the card.` : `${actor} kept the card.`
    case 'call':
      return `${actor} called Last card! just in time.`
    case 'catch':
      return `${actor} caught ${who(move.targetId)} without a Last card! call: ${move.count} cards.`
  }
}
