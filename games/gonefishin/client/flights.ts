// How cards move on Gone Fishin's table, worked out from the move log (see core flights.ts).
import { type CardFlight, dealFlights, FLIGHT_MS } from '@wsfg/core/ui'
import type { GoneFishinView, Move } from '../shared/index.ts'

/** The deal before the first ask; then the latest moves (two, in case they arrive together). */
export function tableFlights(view: GoneFishinView): CardFlight[] {
  const { game, log } = view
  if (view.phase !== 'PLAYING') return []
  if (log.length === 0) return dealFlights(`${game}:deal`, 'center', view.seats)
  const from = Math.max(0, log.length - 2)
  return log.slice(from).flatMap((move, i) => moveFlights(move, `${game}:${from + i}`))
}

// Cards handed over go first, then any draw from the pond.
function moveFlights(move: Move, id: string): CardFlight[] {
  const out: CardFlight[] = []
  if (move.targetId && move.given > 0) out.push({ id: `${id}:given`, from: move.targetId, to: move.askerId, count: move.given })
  if (move.drew) out.push({ id: `${id}:drew`, from: 'center', to: move.askerId, delay: move.given > 0 ? FLIGHT_MS : 0 })
  return out
}
