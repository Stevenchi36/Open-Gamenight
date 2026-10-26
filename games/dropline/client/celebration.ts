import type { Disc, DropLineView } from '../shared/index.ts'

/** DropBoard's longest fall plus its bounce (11 rows), so the celebration waits for the winning disc to land. */
export const LANDED_MS = 700

// The winner's colour in a few shades, with gold and white for sparkle.
const SHADES: Record<Disc, string[]> = {
  red: ['#e53935', '#ff8a80', '#b71c1c', '#ffd54f', '#ffffff'],
  blue: ['#1e88e5', '#90caf9', '#0d47a1', '#ffd54f', '#ffffff'],
}

export function winnerConfetti(view: DropLineView): string[] | undefined {
  const disc = (['red', 'blue'] as const).find((d) => view.discs[d] === view.winnerId)
  return disc && SHADES[disc]
}
