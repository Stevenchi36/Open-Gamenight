/**
 * Integration simulation (PLAN section 10): the real server on a random port
 * with temp SQLite files, driven by real `ws` clients, one signed-in host and
 * three guests, through a full typed round and a full spoken round, then the
 * SIGTERM shutdown path.
 */
import type { ServerMessage } from '@ogn/core/protocol'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { connect, type TestClient } from './helpers/client.ts'
import { startTestServer, type TestServer } from './helpers/server.ts'

type StateMsg = Extract<ServerMessage, { type: 'state' }>
interface GameView {
  phase: string
  round: number
  you: { role: string; word: string | null }
  turn: { currentPlayerId: string | null }
  clues: { word: string }[]
  scores: Record<string, number>
  result?: { judgeId: string | null; imposterId: string; secretWord?: string; imposterWon?: boolean; caught: boolean; guess: string | null }
}

let t: TestServer
let host: TestClient
let guests: TestClient[]
let all: TestClient[]
const ids = new Map<TestClient, string>()

const game = (c: TestClient) => c.last('state')!.game as GameView
const idOf = (c: TestClient) => ids.get(c)!
const byId = (id: string) => all.find((c) => idOf(c) === id)!

/** Resolve once this client's latest state satisfies pred (polls; the reveal alone takes 5s). */
async function until(c: TestClient, pred: (s: StateMsg) => boolean, ms = 10_000): Promise<StateMsg> {
  const deadline = Date.now() + ms
  for (;;) {
    const last = c.last('state')
    if (last && pred(last)) return last
    if (Date.now() > deadline) throw new Error(`timed out waiting for state (phase ${(last?.game as GameView | null)?.phase})`)
    await new Promise((r) => setTimeout(r, 10))
  }
}
const allUntil = (pred: (s: StateMsg) => boolean) => Promise.all(all.map((c) => until(c, pred)))
const phaseIs = (phase: string) => (s: StateMsg) => (s.game as GameView | null)?.phase === phase

async function expectError(c: TestClient, message: unknown, match: RegExp | string) {
  const error = c.next('error')
  c.send(message)
  expect((await error).message).toMatch(match)
}

/** Everything the imposter received from `from` up to (not including) the first RESULTS state. */
function imposterTextBeforeResults(imposter: TestClient, from: number): string {
  const seen: ServerMessage[] = []
  for (const m of imposter.messages.slice(from)) {
    if (m.type === 'state' && (m.game as GameView | null)?.phase === 'RESULTS') break
    seen.push(m)
  }
  return JSON.stringify(seen).toLowerCase()
}

beforeAll(async () => {
  // The script plays far faster than people tap; per-socket rate limiting has its own test in ws.test.ts.
  t = await startTestServer({ ws: { messagesPerSecond: 1000 } })
  await t.createUser('host@example.com', 'user', 'Hosty')
  const cookie = await t.signIn('host@example.com')

  host = await connect(t.wsUrl, { cookie })
  guests = await Promise.all([1, 2, 3].map(() => connect(t.wsUrl)))
  all = [host, ...guests]
  expect((await host.next('session')).user).toMatchObject({ name: 'Hosty' })
  for (const g of guests) expect(await g.next('session')).toMatchObject({ type: 'session', user: null })

  // A small library category so the typed round goes through prepareRound + pickWord.
  const { addWords } = await import('../../../games/imposter/server/library.ts')
  const { createCategoryService } = await import('@ogn/core/categories')
  addWords({ db: t.booted.gamesDb, categories: createCategoryService(t.booted.gamesDb, 'imposter') }, [
    { category: 'Space', word: 'Comet', hint: 'Has a long tail' },
    { category: 'Space', word: 'Saturn', hint: 'Wears rings' },
    { category: 'Space', word: 'Telescope', hint: 'Brings the far close' },
  ])
}, 30_000)

afterAll(() => t?.close())

describe('integration: full games over real websockets', () => {
  it('guests cannot create rooms', async () => {
    for (const g of guests) {
      const error = g.next('error')
      g.send({ type: 'create_room' })
      expect(await error).toMatchObject({ code: 'unauthorized' })
    }
  })

  it('the host creates a room and three guests join', async () => {
    host.send({ type: 'create_room', name: 'Hosty' })
    const { code, playerId } = await host.next('joined')
    ids.set(host, playerId)
    for (const [i, g] of guests.entries()) {
      g.send({ type: 'join_room', code, name: ['Ann', 'Bob', 'Cat'][i] })
      ids.set(g, (await g.next('joined')).playerId)
    }
    const states = await allUntil((s) => s.room.players.length === 4)
    expect(states[0]!.room.players.map((p) => [p.name, p.isHost, p.isLoggedIn])).toEqual([
      ['Hosty', true, true],
      ['Ann', false, false],
      ['Bob', false, false],
      ['Cat', false, false],
    ])
  })

  it('plays a full typed round with a library word', async () => {
    const settings = { ...(host.last('state')!.room.game.settings as object), category: 'Space', guessMode: 'bonus' }
    host.send({ type: 'update_settings', settings })
    await allUntil((s) => (s.room.game.settings as { category: string }).category === 'Space')

    const from = new Map(all.map((c) => [c, c.messages.length]))
    host.send({ type: 'start_game' })
    await allUntil(phaseIs('CLUES'))

    const imposter = all.find((c) => game(c).you.role === 'imposter')!
    const crew = all.filter((c) => c !== imposter)
    const word = game(crew[0]!).you.word!
    expect(['Comet', 'Saturn', 'Telescope']).toContain(word)
    for (const c of crew) expect(game(c).you.word).toBe(word)
    expect(game(imposter).you.word).toBeNull()

    // Clues: only the current player may submit; crew can't use the word.
    let n = 0
    while (game(host).phase === 'CLUES') {
      const current = byId(game(host).turn.currentPlayerId!)
      const other = all.find((c) => c !== current)!
      await expectError(other, { type: 'action', action: { type: 'submit_clue', word: 'nope' } }, "It's not your turn")
      if (current !== imposter && n === 0) {
        await expectError(current, { type: 'action', action: { type: 'submit_clue', word: word.toLowerCase() } }, "can't use the secret word")
      }
      const before = game(host).clues.length
      current.send({ type: 'action', action: { type: 'submit_clue', word: `clue${n++}` } })
      await allUntil((s) => (s.game as GameView).phase !== 'CLUES' || (s.game as GameView).clues.length > before)
    }
    expect(game(host).phase).toBe('VOTING')
    expect(n).toBe(8) // 4 players x 2 rotations

    // Vote the imposter out.
    for (const c of all) {
      const target = c === imposter ? idOf(crew[0]!) : idOf(imposter)
      c.send({ type: 'action', action: { type: 'cast_vote', targetId: target } })
    }
    await allUntil(phaseIs('REVEAL'))
    expect(game(guests[0]!).result).toMatchObject({ caught: true, imposterId: idOf(imposter) })
    await allUntil(phaseIs('GUESS_CHECK'))

    // Only the judge (the host, unless the host is the imposter) may rule on the guess.
    const judge = byId(game(host).result!.judgeId!)
    expect(judge).toBe(imposter === host ? guests[0] : host)
    const notJudge = crew.find((c) => c !== judge)!
    await expectError(notJudge, { type: 'action', action: { type: 'judge_guess', correct: true } }, 'Only the judge can decide')
    await expectError(imposter, { type: 'action', action: { type: 'judge_guess', correct: true } }, 'Only the judge can decide')
    // Typed mode: the imposter types the guess first (a misspelling the judge accepts).
    await expectError(judge, { type: 'action', action: { type: 'judge_guess', correct: true } }, 'Wait for the guess')
    imposter.send({ type: 'action', action: { type: 'submit_guess', word: 'misspeled' } })
    await allUntil((s) => (s.game as GameView).result?.guess === 'misspeled')
    judge.send({ type: 'action', action: { type: 'judge_guess', correct: true } })
    await allUntil(phaseIs('RESULTS'))

    const result = game(imposter).result!
    expect(result).toMatchObject({ caught: true, imposterWon: false, secretWord: word })
    for (const c of crew) expect(game(c).scores[idOf(c)]).toBe(1) // catch point
    expect(game(host).scores[idOf(imposter)]).toBe(1) // correct-guess bonus

    // Secrecy: the imposter never received the word before RESULTS, and no raw state ever left the server.
    expect(imposterTextBeforeResults(imposter, from.get(imposter)!)).not.toContain(word.toLowerCase())
    for (const c of all) {
      const text = JSON.stringify(c.messages)
      expect(text).not.toContain('"ballots"')
      expect(text).not.toContain('"secret"')
      expect(text).not.toContain('"usedWordIds"')
    }
  }, 30_000)

  it('plays a full spoken round', async () => {
    host.send({ type: 'return_to_lobby' })
    await allUntil((s) => s.room.phase === 'lobby')
    const settings = { ...(host.last('state')!.room.game.settings as object), clueMode: 'spoken', wordSource: 'all', category: null }
    host.send({ type: 'update_settings', settings })
    await allUntil((s) => (s.room.game.settings as { clueMode: string }).clueMode === 'spoken')

    const from = new Map(all.map((c) => [c, c.messages.length]))
    host.send({ type: 'start_game' })
    await allUntil(phaseIs('CLUES'))
    const imposter = all.find((c) => game(c).you.role === 'imposter')!
    const crew = all.filter((c) => c !== imposter)
    const word = game(crew[0]!).you.word!
    expect(game(host).round).toBe(1) // back in the lobby means a fresh game

    // Spoken mode: typed clues are rejected; turns end with Done (current player, or the host for anyone).
    const first = byId(game(host).turn.currentPlayerId!)
    await expectError(first, { type: 'action', action: { type: 'submit_clue', word: 'x' } }, 'Clues are spoken out loud')
    let turns = 0
    while (game(host).phase === 'CLUES') {
      const current = byId(game(host).turn.currentPlayerId!)
      const bystander = all.find((c) => c !== current && c !== host)!
      if (turns === 0) await expectError(bystander, { type: 'action', action: { type: 'end_turn' } }, "It's not your turn")
      const tapper = turns++ % 2 === 0 ? current : host // the host can tap Done for anyone
      tapper.send({ type: 'action', action: { type: 'end_turn' } })
      // with 4 players nobody has two turns in a row, so the current player always changes
      await allUntil((s) => (s.game as GameView).phase !== 'CLUES' || (s.game as GameView).turn.currentPlayerId !== idOf(current))
    }
    expect(game(host).clues).toEqual([]) // no clue feed in spoken mode
    expect(turns).toBe(8)

    // Everyone votes for an innocent crew member: the imposter escapes.
    const [framed, other] = crew
    for (const c of all) {
      const target = c === framed ? idOf(other!) : idOf(framed!)
      c.send({ type: 'action', action: { type: 'cast_vote', targetId: target } })
    }
    await allUntil(phaseIs('REVEAL'))
    await allUntil(phaseIs('GUESS_CHECK'))
    const judge = byId(game(host).result!.judgeId!)
    judge.send({ type: 'action', action: { type: 'judge_guess', correct: false } })
    await allUntil(phaseIs('RESULTS'))

    expect(game(host).result).toMatchObject({ caught: false, imposterWon: true, secretWord: word })
    expect(game(host).scores[idOf(imposter)]).toBe(2) // escape points
    expect(imposterTextBeforeResults(imposter, from.get(imposter)!)).not.toContain(word.toLowerCase())
  }, 30_000)

  it('SIGTERM path: every player gets the restart notice and a clean 1012 close', async () => {
    const notices = all.map((c) => c.next('notice', (m) => m.kind === 'server_restarting'))
    await t.shutdown()
    for (const n of await Promise.all(notices)) expect(n.message).toMatch(/restarting/i)
    for (const c of all) expect((await c.closed).code).toBe(1012)
  })
})
