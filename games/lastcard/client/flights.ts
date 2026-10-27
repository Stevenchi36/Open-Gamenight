// How cards move on Last Card's table, worked out from the move log (see core flights.ts).
// Anchors in the middle of the table: 'draw' (the draw pile) and 'discard' (the top card).
import type { PlayerId } from '@ogn/core/contract'
import { type CardFlight, dealFlights, dealTime, FLIGHT_MS } from '@ogn/core/ui'
import type { LastCardView, LcCard, Move } from '../shared/index.ts'

/** Hands swapping (a 7 or a 0 with 7-0 swaps) fly as a few cards each way. */
const SWAP_CARDS = 3

/** The deal, then the first card turned up, before the first move; after that the latest moves. */
export function tableFlights(view: LastCardView, me: PlayerId): CardFlight<LcCard>[] {
  const { round, log } = view
  if (view.phase !== 'PLAYING') return []
  if (log.length === 0) {
    return [
      ...dealFlights(`${round}:deal`, 'draw', view.seats),
      { id: `${round}:first`, from: 'draw', to: 'discard', faces: [view.top], flip: true, delay: dealTime(view.seats.length), onMount: true },
    ]
  }
  const from = Math.max(0, log.length - 2)
  return log.slice(from).flatMap((move, i) => moveFlights(view, move, `${round}:${from + i}`, me))
}

function moveFlights(view: LastCardView, move: Move, id: string, me: PlayerId): CardFlight<LcCard>[] {
  switch (move.kind) {
    case 'play': {
      // Your own card is already face up in your hand; anyone else's turns over on the way.
      const out: CardFlight<LcCard>[] = [{ id, from: move.playerId, to: 'discard', faces: [move.card], flip: move.playerId !== me }]
      for (const [a, b] of swaps(view, move)) out.push({ id: `${id}:${a}`, from: a, to: b, count: SWAP_CARDS, delay: FLIGHT_MS })
      return out
    }
    case 'draw':
      return move.count > 0 ? [{ id, from: 'draw', to: move.playerId, count: move.count }] : []
    case 'catch':
      return [{ id, from: 'draw', to: move.targetId, count: move.count }]
    default:
      return []
  }
}

/** Who passes a hand to whom after a play: a 7's two players trade, a 0 sends every hand on round the table. */
function swaps(view: LastCardView, move: Extract<Move, { kind: 'play' }>): [PlayerId, PlayerId][] {
  if (move.swapWith) {
    return [
      [move.playerId, move.swapWith],
      [move.swapWith, move.playerId],
    ]
  }
  if (!view.settings.sevenZero || move.card.value !== '0') return []
  // The last card played (a 0) ends the round without a swap, and then the phase isn't PLAYING.
  const ids = view.seats.filter((s) => !s.left).map((s) => s.id)
  return ids.map((id, i) => [id, ids[(i + view.direction + ids.length) % ids.length]!])
}

/** When cards new to your hand drop in: after a swap's cards have crossed, otherwise as a flight lands. */
export function arriveDelay(view: LastCardView): number {
  const last = view.log.at(-1)
  return last?.kind === 'play' && swaps(view, last).length > 0 ? 2 * FLIGHT_MS - 90 : FLIGHT_MS - 90
}

/** When the top card shown on the table should change, so it turns up as the card lands, not as it leaves. */
export function topDelay(view: LastCardView): number {
  return view.log.length === 0 ? dealTime(view.seats.length) + FLIGHT_MS : FLIGHT_MS
}
