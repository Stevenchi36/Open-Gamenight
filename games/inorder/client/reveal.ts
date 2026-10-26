import type { InOrderView, RoundResult } from '../shared/index.ts'

/** How long each card takes to turn over in the reveal. */
export const TURN_MS = 700

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The reveal's headline; `won` is the line for a game won ("You made it!" on a phone). */
export function roundHeadline(result: RoundResult, won: string): string {
  if (result.outcome === 'won') return won
  if (result.outcome === 'lost') return 'Out of lives'
  return result.livesLost === 0 ? 'Perfect order!' : plural(result.livesLost, 'card out of place', 'cards out of place')
}

/** Lives lost this round, then where that leaves the team. */
export function roundDetail(result: RoundResult, view: Pick<InOrderView, 'lives' | 'cleared'>): string {
  const lost = result.livesLost === 0 ? 'No lives lost.' : `${plural(result.livesLost, 'life', 'lives')} lost.`
  if (result.outcome === 'won') return `${lost} Every round cleared, with ${plural(view.lives, 'life', 'lives')} to spare.`
  if (result.outcome === 'lost') return `${lost} The team cleared ${plural(view.cleared, 'round', 'rounds')}.`
  return `${lost} ${plural(view.lives, 'life', 'lives')} left.`
}
