import { describe, expect, it } from 'vitest'
import { announceText } from '../client/announce.ts'
import { catchImposter, newGame, playClues, toGuessCheckOrResults, WORD, type Sim } from './helpers.ts'

const name = (id: string) => id.toUpperCase()
const SECRET = 'word' in WORD ? WORD.word : ''

/** Runs `step`, then returns what each player hears for it. */
function heard(sim: Sim, step: () => void): Record<string, string | null> {
  const before = Object.fromEntries(sim.players.map((p) => [p.id, sim.view(p.id)]))
  step()
  return Object.fromEntries(sim.players.map((p) => [p.id, announceText(sim.view(p.id), before[p.id]!, p.id, name)]))
}

function act(sim: Sim, id: string, action: Parameters<Sim['act']>[1]): void {
  const result = sim.act(id, action)
  if (!result.ok) throw new Error(result.error)
}

describe('announceText', () => {
  it('reads clues, turns, votes, the reveal and the guess, and the word only at the results', () => {
    const sim = newGame({ imposter: 'p2', settings: { guessMode: 'bonus' } })
    const spoken: string[] = []
    const hear = (step: () => void) => {
      const lines = Object.values(heard(sim, step)).filter((t): t is string => !!t)
      spoken.push(...lines)
      return lines
    }

    const first = sim.view('p1').turn.currentPlayerId!
    const lines = hear(() => act(sim, first, { type: 'submit_clue', word: 'tuxedo' }))
    expect(lines.some((t) => t.startsWith(`${name(first)}'s clue: tuxedo.`) || t.startsWith('Your clue: tuxedo.'))).toBe(true)

    hear(() => playClues(sim))
    expect(spoken).toContain('Time to vote: who is the imposter?')
    const vote = heard(sim, () => act(sim, 'p1', { type: 'cast_vote', targetId: 'p2' }))
    expect(vote).toMatchObject({ p1: 'You voted, 1 of 4', p3: 'P1 voted, 1 of 4' })
    hear(() => catchImposter(sim))
    expect(spoken.some((t) => t.startsWith('Caught! P2 was the imposter.'))).toBe(true)

    hear(() => toGuessCheckOrResults(sim))
    expect(sim.state.phase).toBe('GUESS_CHECK')
    hear(() => act(sim, 'p2', { type: 'submit_guess', word: 'Walrus' }))
    expect(spoken).toContain('P2 guessed: Walrus.')

    // Nothing so far may give the word away: the imposter's phone reads aloud too.
    expect(SECRET).not.toBe('')
    expect(spoken.filter((t) => t.includes(SECRET))).toEqual([])

    const judge = sim.view('p1').result!.judgeId!
    const results = heard(sim, () => act(sim, judge, { type: 'judge_guess', correct: false }))
    expect(results.p2).toBe(`The crew wins. The word was ${SECRET}.`)
  })
})
