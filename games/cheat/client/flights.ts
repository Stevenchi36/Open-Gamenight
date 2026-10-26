// How cards move on Cheat's table, worked out from the move log (see core flights.ts).
import { type CardFlight, dealFlights, FLIGHT_MS } from '@wsfg/core/ui'
import type { CheatView, Move } from '../shared/index.ts'

const REVEAL_HOLD_MS = 1100
const PICKUP_MS = FLIGHT_MS + REVEAL_HOLD_MS

/** The deal before the first move; then the latest moves (two, in case they arrive together). */
export function tableFlights(view: CheatView): CardFlight[] {
  const { game, log } = view
  if (view.phase !== 'PLAYING') return []
  if (log.length === 0) return dealFlights(`${game}:deal`, 'center', view.seats)
  const from = Math.max(0, log.length - 2)
  return log.slice(from).flatMap((move, i) => moveFlights(move, `${game}:${view.logStart + from + i}`))
}

function moveFlights(move: Move, id: string): CardFlight[] {
  if (move.kind === 'play') return [{ id, from: move.playerId, to: 'center', count: move.count }]
  if (move.kind === 'skip') return []
  // A call: the play turns over above the pile for everyone to see, then the pile goes to whoever picks it up.
  return [
    { id: `${id}:reveal`, from: 'center', to: 'center', faces: move.cards, flip: true, rise: 40, hold: REVEAL_HOLD_MS },
    { id: `${id}:pickup`, from: 'center', to: move.pickerId, count: move.picked, delay: PICKUP_MS, stagger: 40 },
  ]
}

/** When cards new to your hand drop in: after the pile reaches you, if you just picked it up. */
export function arriveDelay(view: CheatView): number {
  return view.log.at(-1)?.kind === 'call' ? PICKUP_MS + FLIGHT_MS - 90 : FLIGHT_MS - 90
}
