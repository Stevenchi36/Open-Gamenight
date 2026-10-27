// How cards move on Old Maid's table, worked out from the move log (see core flights.ts).
import { type CardFlight, dealFlights, FLIGHT_MS } from '@ogn/core/ui'
import type { Card } from '@ogn/core/kit'
import type { Move, OldMaidView } from '../shared/index.ts'

/** The deal before the first draw; then the latest draws (two, in case they arrive together). */
export function tableFlights(view: OldMaidView): CardFlight<Card>[] {
  const key = `${view.game}:${view.round}`
  const { log } = view
  if (log.length === 0) {
    return view.phase === 'PLAYING' ? dealFlights(`${key}:deal`, 'center', view.seats.filter((s) => s.inRound && !s.left)) : []
  }
  const from = Math.max(0, log.length - 2)
  return log.slice(from).flatMap((move, i) => moveFlights(move, `${key}:${from + i}`))
}

// The card taken goes face down unless the viewer knows it; a pair it makes then goes to the discard.
function moveFlights(move: Move, id: string): CardFlight<Card>[] {
  const out: CardFlight<Card>[] = [{ id: `${id}:take`, from: move.fromId, to: move.drawerId, ...(move.card ? { faces: [move.card] } : {}) }]
  if (move.pair) out.push({ id: `${id}:pair`, from: move.drawerId, to: 'discard', faces: move.pair, delay: FLIGHT_MS })
  return out
}
