import { DatabaseSync } from 'node:sqlite'
import { CATEGORIES_MIGRATION, createCategoryService } from '@wsfg/core/categories'
import { AiError, type ServerServices } from '@wsfg/core/contract'
import { createSim } from '@wsfg/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import { imposter as pureGame } from '../server/game.ts'
import { imposter } from '../server/index.ts'
import {
  addWords,
  categoryUsage,
  generateWords,
  listCategories,
  listWords,
  pickWord,
  removeWords,
  updateWord,
} from '../server/library.ts'
import { migrations } from '../server/migrations.ts'
import { defaultSettings, type ImposterSettings } from '../shared/index.ts'

let db: DatabaseSync
let services: ServerServices

/** Same order as the server: core tables first, then the game's migrations. */
function freshDb() {
  const d = new DatabaseSync(':memory:')
  d.exec('PRAGMA foreign_keys = ON')
  d.exec(CATEGORIES_MIGRATION.sql)
  for (const m of migrations) d.exec(m.sql)
  return d
}

beforeEach(() => {
  db = freshDb()
  services = {
    gameId: 'imposter',
    db,
    ai: null,
    logger: { info() {}, warn() {}, error() {} },
    categories: createCategoryService(db, 'imposter'),
  }
})

const words = [
  { category: 'Animals', word: 'Penguin', hint: 'Dressed for dinner' },
  { category: 'Animals', word: 'Giraffe', hint: 'Sees over the fence' },
  { category: 'Food', word: 'Pizza', hint: 'Shared at parties', difficulty: 'easy' as const },
]
const idOf = (name: string) => services.categories.findByName(name)!.id

describe('migration 002: categories move to the shared table', () => {
  it('converts existing words to category ids, keeping ids and usage', () => {
    const old = new DatabaseSync(':memory:')
    old.exec('PRAGMA foreign_keys = ON')
    old.exec(CATEGORIES_MIGRATION.sql)
    old.exec(migrations[0]!.sql)
    old.exec(`INSERT INTO imposter_words (id, category, word, hint, times_used) VALUES
      (7, 'Space', 'Comet', 'Has a long tail', 3), (8, 'space', 'Saturn', 'Wears rings', 0), (9, 'Food', 'Pizza', 'Shared', 1)`)
    old.exec("INSERT INTO categories (game_id, name) VALUES ('other', 'Space')") // another game's category is untouched
    old.exec(migrations[1]!.sql)

    expect(old.prepare("SELECT name FROM categories WHERE game_id = 'imposter' ORDER BY name").all()).toEqual([
      { name: 'Food' },
      { name: 'Space' },
    ])
    expect(listWords(old).words.map((w) => [w.id, w.category, w.word, w.times_used])).toEqual([
      [9, 'Food', 'Pizza', 1],
      [7, 'Space', 'Comet', 3],
      [8, 'Space', 'Saturn', 0],
    ])
    expect(old.prepare("SELECT name FROM sqlite_master WHERE name = 'imposter_words_new'").get()).toBeUndefined()
  })
})

describe('addWords', () => {
  it('validates, inserts, creates missing categories and skips duplicates case-insensitively', () => {
    expect(addWords(services, words)).toEqual({ inserted: 3, skipped: [], createdCategories: ['Animals', 'Food'] })
    const again = addWords(services, [
      { category: 'animals', word: 'PENGUIN', hint: 'Different hint' },
      { category: 'food', word: 'Taco', hint: 'A taco shell' },
      { category: 'FOOD', word: 'Taco', hint: 'Folded and filled' },
    ])
    expect(again).toEqual({
      inserted: 1,
      skipped: [
        { word: 'PENGUIN', category: 'Animals', reason: 'Already in the library' },
        { word: 'Taco', category: 'food', reason: 'Hint must not contain the word' },
      ],
      createdCategories: [],
    })
    expect(services.categories.list().map((c) => c.name)).toEqual(['Animals', 'Food'])
  })

  it('rolls back everything if an insert fails midway', () => {
    db.exec("CREATE TRIGGER boom BEFORE INSERT ON imposter_words WHEN NEW.word = 'Boom' BEGIN SELECT RAISE(ABORT, 'boom'); END")
    expect(() =>
      addWords(services, [
        { category: 'Toys', word: 'Kite', hint: 'Windy days' },
        { category: 'Toys', word: 'Boom', hint: 'Loud' },
      ]),
    ).toThrow('boom')
    expect(listWords(db).total).toBe(0)
    expect(services.categories.list()).toEqual([])
  })
})

describe('listWords / listCategories / updateWord / removeWords', () => {
  beforeEach(() => void addWords(services, words))

  it('filters by category id or name and query (LIKE characters escaped), and pages', () => {
    expect(listWords(db, { categoryId: idOf('Animals') }).total).toBe(2)
    expect(listWords(db, { category: 'animals' }).total).toBe(2)
    expect(listWords(db, { q: 'fence' }).words.map((w) => w.word)).toEqual(['Giraffe'])
    expect(listWords(db, { q: '%' }).total).toBe(0)
    expect(listWords(db, { limit: 1, offset: 1 })).toMatchObject({ total: 3, words: [{ word: 'Penguin', category: 'Animals' }] })
  })

  it('lists every category, including empty ones, with total and unused counts', () => {
    services.categories.create('Toys')
    pickWord(db, { category: 'Animals' })
    expect(listCategories(db)).toEqual([
      { id: idOf('Animals'), category: 'Animals', total: 2, unused: 1 },
      { id: idOf('Food'), category: 'Food', total: 1, unused: 1 },
      { id: idOf('Toys'), category: 'Toys', total: 0, unused: 0 },
    ])
    expect(categoryUsage(db)).toEqual({ [idOf('Animals')]: 2, [idOf('Food')]: 1 })
  })

  it('edits and moves a word with the same validation as adding', () => {
    const penguin = listWords(db, { q: 'Penguin' }).words[0]!
    const moved = updateWord(services, penguin.id, { categoryId: idOf('Food'), hint: 'Waddles in a suit' })
    expect(moved).toMatchObject({ ok: true, value: { category: 'Food', word: 'Penguin', hint: 'Waddles in a suit' } })
    expect(updateWord(services, penguin.id, { word: 'pizza' })).toEqual({ ok: false, error: 'pizza is already in Food' })
    expect(updateWord(services, penguin.id, { hint: 'a PENGUIN' })).toEqual({ ok: false, error: 'Hint must not contain the word' })
    expect(updateWord(services, penguin.id, { categoryId: 999 })).toEqual({ ok: false, error: 'No such category' })
    expect(updateWord(services, 999, {})).toEqual({ ok: false, error: 'No such word' })
  })

  it('a category with words cannot be deleted; an emptied one can', () => {
    const food = idOf('Food')
    expect(() => services.categories.remove(food)).toThrow(expect.objectContaining({ code: 'in_use' }))
    removeWords(db, listWords(db, { categoryId: food }).words.map((w) => w.id))
    services.categories.remove(food)
    expect(services.categories.get(food)).toBeNull()
  })

  it('renaming a category renames it for its words', () => {
    services.categories.rename(idOf('Food'), 'Snacks')
    expect(listWords(db, { q: 'Pizza' }).words[0]!.category).toBe('Snacks')
  })
})

describe('pickWord', () => {
  beforeEach(() => void addWords(services, words))

  it('picks least-used first, marks it used, and honors category and excludeIds', () => {
    const first = pickWord(db, { category: 'Animals' })!
    const second = pickWord(db, { category: 'animals' })!
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
    imposter.prepareRound!(request, { settings: { ...defaultSettings, ...settings }, players, services })

  it('returns nothing for builtin mode and for actions that do not start a round', async () => {
    addWords(services, words)
    expect(await prepare({ wordSource: 'builtin' }, { trigger: 'init' })).toBeUndefined()
    const state = {} as never
    expect(await prepare({}, { trigger: 'action', state, action: { type: 'end_turn' }, actorId: 'p1' })).toBeUndefined()
  })

  it('picks a library word, excluding words used in this room on next_round', async () => {
    addWords(services, words)
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
    addWords(services, words)
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

describe('generateWords', () => {
  const entry = (word: string, hint = 'Something vague', category = 'Space') => ({ category, word, hint, difficulty: 'easy' as const })
  const fakeAi = (...replies: (unknown | Error)[]) => {
    const calls: unknown[] = []
    return {
      calls,
      ai: {
        async generate(request: unknown) {
          calls.push(request)
          const next = replies.shift()
          if (next instanceof Error) throw next
          return next as never
        },
      },
    }
  }

  it('returns screened candidates, capped to the requested count, using the stored category spelling', async () => {
    addWords(services, [{ category: 'Space', word: 'Comet', hint: 'Has a long tail' }])
    const { ai, calls } = fakeAi({ words: [entry('Comet'), entry('Nebula'), entry('nebula'), entry('Pulsar'), entry('Quasar')] })
    const result = await generateWords(ai, services, { count: 2, category: 'space', userId: 'a1' })
    expect(result.candidates.map((c) => [c.category, c.word])).toEqual([
      ['Space', 'Nebula'],
      ['Space', 'Pulsar'],
    ])
    expect(result.skipped.map((s) => s.word)).toEqual(['Comet', 'nebula'])
    expect(JSON.stringify(calls[0])).toContain('Comet') // avoid-list in the prompt
    expect(listWords(db).total).toBe(1) // nothing saved
  })

  it('retries once on an invalid response, then errors', async () => {
    const ok = fakeAi(new AiError('invalid', 'bad'), { words: [entry('Nebula')] })
    expect((await generateWords(ok.ai, services, { count: 1, userId: null })).candidates).toHaveLength(1)
    expect(ok.calls).toHaveLength(2)

    const bad = fakeAi({ words: [entry('Moon', 'The moon')] }, { words: [] })
    await expect(generateWords(bad.ai, services, { count: 1, userId: null })).rejects.toMatchObject({ code: 'invalid' })
    expect(bad.calls).toHaveLength(2)
  })

  it('does not retry cap or rate-limit errors', async () => {
    const capped = fakeAi(new AiError('cap', 'budget'))
    await expect(generateWords(capped.ai, services, { count: 5, userId: null })).rejects.toMatchObject({ code: 'cap' })
    expect(capped.calls).toHaveLength(1)
  })
})
