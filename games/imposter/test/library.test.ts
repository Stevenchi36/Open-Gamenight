import { DatabaseSync } from 'node:sqlite'
import { createSim } from '@wsfg/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { imposter as pureGame } from '../server/game.ts'
import { imposter } from '../server/index.ts'
import { addWords, listCategories, listWords, pickWord, removeWords } from '../server/library.ts'
import { migrations } from '../server/migrations.ts'
import { defaultSettings, type ImposterSettings } from '../shared/index.ts'

let db: DatabaseSync
const services = () => ({
  gameId: 'imposter',
  db,
  ai: null,
  logger: { info() {}, warn() {}, error() {} },
})

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  for (const m of migrations) db.exec(m.sql)
})

const words = [
  { category: 'Animals', word: 'Penguin', hint: 'Dressed for dinner' },
  { category: 'Animals', word: 'Giraffe', hint: 'Sees over the fence' },
  { category: 'Food', word: 'Pizza', hint: 'Shared at parties', difficulty: 'easy' as const },
]

describe('addWords', () => {
  it('validates, inserts and skips duplicates case-insensitively', () => {
    expect(addWords(db, words)).toEqual({ inserted: 3, skipped: [] })
    const again = addWords(db, [
      { category: 'animals', word: 'PENGUIN', hint: 'Different hint' },
      { category: 'Food', word: 'Taco', hint: 'A taco shell' },
      { category: 'Food', word: 'Taco', hint: 'Folded and filled' },
    ])
    expect(again.inserted).toBe(1)
    expect(again.skipped.map((s) => s.reason)).toEqual(['Already in the library', 'Hint must not contain the word'])
  })
})

describe('listWords / listCategories / removeWords', () => {
  beforeEach(() => void addWords(db, words))

  it('filters by category and query (with LIKE characters escaped) and pages', () => {
    expect(listWords(db, { category: 'animals' }).total).toBe(2)
    expect(listWords(db, { q: 'fence' }).words.map((w) => w.word)).toEqual(['Giraffe'])
    expect(listWords(db, { q: '%' }).total).toBe(0)
    const page = listWords(db, { limit: 1, offset: 1 })
    expect(page).toMatchObject({ total: 3, words: [{ word: 'Penguin' }] })
  })

  it('counts total and unused per category', () => {
    pickWord(db, { category: 'Animals' })
    expect(listCategories(db)).toEqual([
      { category: 'Animals', total: 2, unused: 1 },
      { category: 'Food', total: 1, unused: 1 },
    ])
  })

  it('removes by id', () => {
    const ids = listWords(db).words.map((w) => w.id)
    expect(removeWords(db, [ids[0]!, 9999])).toBe(1)
    expect(listWords(db).total).toBe(2)
  })
})

describe('pickWord', () => {
  beforeEach(() => void addWords(db, words))

  it('picks least-used first, marks it used, and honors category and excludeIds', () => {
    const first = pickWord(db, { category: 'Animals' })!
    const second = pickWord(db, { category: 'Animals' })!
    expect(new Set([first.word, second.word])).toEqual(new Set(['Penguin', 'Giraffe']))
    expect(second.times_used).toBe(1)
    expect(pickWord(db, { category: 'Animals', excludeIds: [first.id, second.id] })).toBeNull()
    expect(pickWord(db, { category: 'Nope' })).toBeNull()
  })

  it('is random among ties', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      db.exec('UPDATE imposter_words SET times_used = 0')
      seen.add(pickWord(db, { category: 'Animals' })!.word)
    }
    expect(seen.size).toBe(2)
  })
})

describe('prepareRound', () => {
  const players = [{ id: 'p1', name: 'A', connected: true, isLoggedIn: true }]
  const prepare = (settings: Partial<ImposterSettings>, request: Parameters<NonNullable<typeof imposter.prepareRound>>[0]) =>
    imposter.prepareRound!(request, { settings: { ...defaultSettings, ...settings }, players, services: services() })

  it('returns nothing for builtin mode and for actions that do not start a round', async () => {
    addWords(db, words)
    expect(await prepare({ wordSource: 'builtin' }, { trigger: 'init' })).toBeUndefined()
    const state = {} as never
    expect(await prepare({}, { trigger: 'action', state, action: { type: 'end_turn' }, actorId: 'p1' })).toBeUndefined()
  })

  it('picks a library word, excluding words used in this room on next_round', async () => {
    addWords(db, words)
    const a = await prepare({ category: 'Animals' }, { trigger: 'init' })
    expect(a).toMatchObject({ category: 'Animals' })
    const state = { usedWordIds: [(a as { id: number }).id] } as never
    const b = await prepare({ category: 'Animals' }, { trigger: 'action', state, action: { type: 'next_round' }, actorId: 'p1' })
    expect((b as { word: string }).word).not.toBe((a as { word: string }).word)
  })

  it('falls back to built-in words with a notice', async () => {
    expect(await prepare({}, { trigger: 'init' })).toEqual({
      builtin: true,
      notice: 'The word library is empty, so built-in words are used.',
    })
    addWords(db, words)
    expect(await prepare({ category: 'Toys' }, { trigger: 'init' })).toMatchObject({
      builtin: true,
      notice: expect.stringContaining('No unused library words in Toys'),
    })
  })

  it('the reducer turns a fallback into a built-in word and tells the host', () => {
    const sim = createSim(pureGame, {
      players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
      settings: { ...defaultSettings, category: 'Toys' },
      prepare: () => ({ builtin: true as const, notice: 'Library empty' }),
    })
    expect(sim.state.secret).toMatchObject({ id: null, category: 'Toys' })
    expect(sim.noticesFor('p1')).toEqual(['Library empty'])
    expect(sim.noticesFor('p2')).toEqual([])
  })
})
