import type { FlockView } from '../shared/index.ts'

/** "The flock said Cheerios (3 players).", or why there's no flock. */
export function flockSummary(view: Pick<FlockView, 'groups' | 'flockId'>, when: 'so far' | 'final'): string {
  const flock = view.groups.find((g) => g.id === view.flockId)
  if (flock) return `The flock ${when === 'so far' ? 'says' : 'said'} ${flock.label}${when === 'so far' ? ' so far' : ''} (${flock.answers.length} players).`
  if (view.groups.length === 0) return 'Nobody answered.'
  if (view.groups[0]!.answers.length === 1) return 'Everyone said something different: no flock.'
  return 'A tie for the most popular answer: no flock.'
}
