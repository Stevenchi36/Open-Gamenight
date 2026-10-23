import type { HerdView } from '../shared/index.ts'

/** "Cheerios is the herd (3 players)", or why there's no herd. */
export function herdSummary(view: Pick<HerdView, 'groups' | 'herdId'>, when: 'so far' | 'final'): string {
  const herd = view.groups.find((g) => g.id === view.herdId)
  if (herd) return `${herd.label} is the herd${when === 'so far' ? ' so far' : ''} (${herd.answers.length} players).`
  if (view.groups.length === 0) return 'Nobody answered.'
  if (view.groups[0]!.answers.length === 1) return 'Everyone said something different: no herd.'
  return 'A tie for the most popular answer: no herd.'
}
