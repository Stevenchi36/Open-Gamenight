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
  playableCategories,
  removeWords,
  screenCandidates,
  updateWord,
} from '../server/library.ts'
import { VAGUE_DEFAULT_HINTS } from '../server/default-hints.ts'
import { DEFAULT_WORDS } from '../server/default-words.ts'
import { migrations } from '../server/migrations.ts'
import { validateWord } from '../server/validate.ts'
import { defaultSettings, type ImposterSettings } from '../shared/index.ts'

let db: DatabaseSync
let services: ServerServices

const SEED_ID = '003_default_words'

/** Same order as the server: core tables first, then the game's migrations. Empty library unless `seed`. */
function freshDb({ seed = false } = {}) {
  const d = new DatabaseSync(':memory:')
  d.exec('PRAGMA foreign_keys = ON')
  d.exec(CATEGORIES_MIGRATION.sql)
  for (const m of migrations) if (seed || m.id !== SEED_ID) d.exec(m.sql)
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
    // Plain SQL: listWords expects columns from later migrations.
    const rows = old
      .prepare('SELECT w.id, c.name, w.word, w.times_used FROM imposter_words w JOIN categories c ON c.id = w.category_id ORDER BY c.name, w.word')
      .all()
    expect(rows.map((w) => Object.values(w))).toEqual([
      [9, 'Food', 'Pizza', 1],
      [7, 'Space', 'Comet', 3],
      [8, 'Space', 'Saturn', 0],
    ])
    expect(old.prepare("SELECT name FROM sqlite_master WHERE name = 'imposter_words_new'").get()).toBeUndefined()
  })
})

describe('migration 005: batches', () => {
  it('leaves existing words unbatched; the next add starts batch 1', () => {
    const d = new DatabaseSync(':memory:')
    d.exec('PRAGMA foreign_keys = ON')
    d.exec(CATEGORIES_MIGRATION.sql)
    for (const m of migrations.slice(0, -1)) if (m.id !== SEED_ID) d.exec(m.sql)
    const lib = { db: d, categories: createCategoryService(d, 'imposter') }
    d.exec(`INSERT INTO imposter_words (category_id, word, hint) VALUES (${lib.categories.create('Space').id}, 'Comet', 'Tail')`)
    d.exec(migrations.at(-1)!.sql)
    expect(listWords(d).words.map((w) => w.batch)).toEqual([null])
    expect(addWords(lib, [{ category: 'Space', word: 'Saturn', hint: 'Rings' }]).batch).toBe(1)
  })
})

describe('migration 003: default words', () => {
  const total = Object.values(DEFAULT_WORDS).flat().length

  it('every default word passes the library rules', () => {
    for (const [category, list] of Object.entries(DEFAULT_WORDS)) {
      for (const [word, hint, difficulty] of list) {
        expect(validateWord({ category, word, hint, difficulty }), `${category}/${word}`).toMatchObject({ ok: true })
      }
    }
  })

  it('seeds every category and word into a fresh library', () => {
    const d = freshDb({ seed: true })
    const byName = Object.fromEntries(listCategories(d).map((c) => [c.category, c.total]))
    expect(byName).toEqual(Object.fromEntries(Object.entries(DEFAULT_WORDS).map(([name, list]) => [name, list.length])))
    expect(listWords(d).total).toBe(total)
  })

  it('keeps an existing library and only adds what is missing', () => {
    const d = freshDb()
    const lib = { db: d, categories: createCategoryService(d, 'imposter') }
    addWords(lib, [{ category: 'animals', word: 'PENGUIN', hint: 'My own hint' }])
    d.exec(migrations.find((m) => m.id === SEED_ID)!.sql)

    expect(d.prepare("SELECT name FROM categories WHERE name = 'Animals' COLLATE NOCASE").all()).toEqual([{ name: 'animals' }])
    expect(listWords(d, { q: 'penguin' }).words.map((w) => w.hint)).toEqual(['My own hint'])
    expect(listWords(d).total).toBe(total)
  })
})

describe('migration 004: one-word default hints', () => {
  const vague = Object.entries(VAGUE_DEFAULT_HINTS).flatMap(([category, list]) =>
    list.map(([word, hint]) => ({ category, word, hint })),
  )

  it('covers every default word with a valid single-word hint', () => {
    expect(vague.map((v) => `${v.category}/${v.word}`).sort()).toEqual(
      Object.entries(DEFAULT_WORDS)
        .flatMap(([category, list]) => list.map(([word]) => `${category}/${word}`))
        .sort(),
    )
    for (const v of vague) {
      expect(v.hint, `${v.category}/${v.word}`).toMatch(/^\S+$/)
      expect(validateWord(v), `${v.category}/${v.word}`).toMatchObject({ ok: true })
    }
  })

  it('replaces seeded hints but keeps ones an admin edited', () => {
    const d = new DatabaseSync(':memory:')
    d.exec('PRAGMA foreign_keys = ON')
    d.exec(CATEGORIES_MIGRATION.sql)
    const vagueId = '004_vague_default_hints'
    for (const m of migrations) if (m.id !== vagueId) d.exec(m.sql)
    d.exec("UPDATE imposter_words SET hint = 'My own hint' WHERE word = 'Penguin'")
    d.exec(migrations.find((m) => m.id === vagueId)!.sql)

    const hintOf = (word: string) => listWords(d, { q: word }).words.find((w) => w.word === word)!.hint
    expect(hintOf('Water Gun')).toBe('Splash')
    expect(hintOf('Penguin')).toBe('My own hint')
    expect(listWords(d).total).toBe(vague.length)
  })
})

describe('addWords', () => {
  it('validates, inserts, creates missing categories and skips duplicates case-insensitively', () => {
    expect(addWords(services, words)).toEqual({
      inserted: 3,
      skipped: [],
      createdCategories: ['Animals', 'Food'],
      insertedByCategory: { Animals: 2, Food: 1 },
      batch: 1,
    })
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
      insertedByCategory: { Food: 1 },
      batch: 2,
    })
    expect(services.categories.list().map((c) => c.name)).toEqual(['Animals', 'Food'])
  })

  it('skips words spelled differently from one in the same category, including within the batch', () => {
    addWords(services, [...words, { category: 'Dinosaurs', word: 'T-Rex', hint: 'Tiny arms' }])
    expect(
      addWords(services, [
        { category: 'Animals', word: 'penguins', hint: 'Waddles' },
        { category: 'Dinosaurs', word: 't rex', hint: 'Roars' },
        { category: 'Food', word: 'Ice Cream', hint: 'Cold' },
        { category: 'Food', word: 'ice-cream!', hint: 'Cone' },
        { category: 'Food', word: 'Penguin', hint: 'Biscuit' }, // other categories don't count
      ]),
    ).toMatchObject({
      inserted: 2,
      skipped: [
        { word: 'penguins', reason: 'Already in the library as Penguin' },
        { word: 't rex', reason: 'Already in the library as T-Rex' },
        { word: 'ice-cream!', reason: 'Already in the library as Ice Cream' },
      ],
    })
  })

  it('screens generated words against the library and the batch by spelling', () => {
    addWords(services, words)
    expect(
      screenCandidates(
        services,
        [
          { category: 'animal', word: 'Giraffes', hint: 'Tall' },
          { category: 'Space', word: 'Black Hole', hint: 'Dark' },
          { category: 'space', word: 'black-holes', hint: 'Pull' },
        ],
        null,
      ),
    ).toEqual({
      candidates: [{ category: 'Space', word: 'Black Hole', hint: 'Dark', difficulty: 'medium' }],
      skipped: [
        { word: 'Giraffes', category: 'Animals', reason: 'Already in the library as Giraffe' },
        { word: 'black-holes', category: 'space', reason: 'Already in the library' },
      ],
    })
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
    expect(updateWord(services, penguin.id, { word: 'pizzas' })).toEqual({ ok: false, error: 'Pizza is already in Food' })
    expect(updateWord(services, penguin.id, { hint: 'a PENGUIN' })).toEqual({ ok: false, error: 'Hint must not contain the word' })
    expect(updateWord(services, penguin.id, { categoryId: 999 })).toEqual({ ok: false, error: 'No such category' })
    expect(updateWord(services, 999, {})).toEqual({ ok: false, error: 'No such word' })
    expect(updateWord(services, penguin.id, { word: 'PENGUINS' })).toMatchObject({ ok: true, value: { word: 'PENGUINS' } }) // itself
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

  it('returns nothing for actions that do not start a round', async () => {
    addWords(services, words)
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

  it('"Added only" skips starter words until added ones run out, then uses them with a notice', async () => {
    addWords(services, [{ category: 'Animals', word: 'Otter', hint: 'River' }], 'builtin')
    addWords(services, [{ category: 'Animals', word: 'Penguin', hint: 'Tuxedo' }], 'manual')
    const first = await prepare({ wordSource: 'custom' }, { trigger: 'init' })
    expect(first).toMatchObject({ word: 'Penguin' })
    expect(first).not.toHaveProperty('notice')
    const state = { usedWordIds: [(first as { id: number }).id] } as never
    const next = { trigger: 'action', state, action: { type: 'next_round' }, actorId: 'p1' } as const
    expect(await prepare({ wordSource: 'custom', category: 'Animals' }, next)).toMatchObject({
      word: 'Otter',
      notice: 'No unused added words in Animals, so built-in words are used.',
    })
    // "All words" plays starter words without a notice
    expect(await prepare({ wordSource: 'all' }, next)).not.toHaveProperty('notice')
  })

  it('"Recently added" plays the newest batch first, then older words with a notice', async () => {
    addWords(services, [{ category: 'Animals', word: 'Otter', hint: 'River' }], 'builtin')
    const first = addWords(services, [{ category: 'Animals', word: 'Penguin', hint: 'Tuxedo' }], 'claude')
    // a second call of the same request joins its batch
    const second = addWords(services, [{ category: 'Food', word: 'Pizza', hint: 'Slice' }], 'claude', first.batch)
    addWords(services, [{ category: 'Animals', word: 'Giraffe', hint: 'Tall' }], 'claude')
    expect([first.batch, second.batch]).toEqual([2, 2])

    const played: string[] = []
    const usedWordIds: number[] = []
    for (let i = 0; i < 4; i++) {
      const request = i === 0 ? ({ trigger: 'init' } as const) : ({ trigger: 'action', state: { usedWordIds } as never, action: { type: 'next_round' }, actorId: 'p1' } as const)
      const word = (await prepare({ wordSource: 'recent' }, request)) as { id: number; word: string; notice?: string }
      played.push(word.notice ? `${word.word}!` : word.word)
      usedWordIds.push(word.id)
    }
    // "!" marks the host notice: past the newest batch (Giraffe), every round says so
    expect(played[0]).toBe('Giraffe')
    expect(new Set(played.slice(1, 3))).toEqual(new Set(['Penguin!', 'Pizza!']))
    expect(played[3]).toBe('Otter!')
  })

  it('"Recently added" in a category looks at that category\'s newest batch', async () => {
    addWords(services, [{ category: 'Animals', word: 'Penguin', hint: 'Tuxedo' }])
    addWords(services, [{ category: 'Food', word: 'Pizza', hint: 'Slice' }])
    expect(await prepare({ wordSource: 'recent', category: 'Animals' }, { trigger: 'init' })).toEqual(
      expect.not.objectContaining({ notice: expect.anything() }),
    )
  })

  it('lists playable categories with their non-starter counts', () => {
    addWords(services, [{ category: 'Animals', word: 'Otter', hint: 'River' }], 'builtin')
    addWords(services, words, 'claude')
    services.categories.create('Empty')
    expect(playableCategories(db)).toEqual([
      { category: 'Animals', total: 3, custom: 2 },
      { category: 'Food', total: 1, custom: 1 },
    ])
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
    const result = await generateWords(ai, services, { count: 2, category: 'space', instructions: 'Really easy, for young kids', userId: 'a1' })
    expect(result.candidates.map((c) => [c.category, c.word])).toEqual([
      ['Space', 'Nebula'],
      ['Space', 'Pulsar'],
    ])
    expect(result.skipped.map((s) => s.word)).toEqual(['Comet', 'nebula'])
    expect(JSON.stringify(calls[0])).toContain('Comet') // avoid-list in the prompt
    expect(JSON.stringify(calls[0])).toContain('Extra instructions from the admin (follow them, within the rules above): Really easy, for young kids')
    expect(listWords(db).total).toBe(1) // nothing saved
  })

  it('asks for one-word hints unless a hint style is given', async () => {
    const { ai, calls } = fakeAi({ words: [entry('Nebula')] }, { words: [entry('Pulsar')] })
    await generateWords(ai, services, { count: 1, userId: null })
    await generateWords(ai, services, { count: 1, hintStyle: 'short phrases', userId: null })
    expect(JSON.stringify(calls[0])).toContain('a single, loosely related word')
    expect(JSON.stringify(calls[0])).not.toContain('Hint style')
    expect(JSON.stringify(calls[1])).toContain('Hint style (overrides the one-word default): short phrases')
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
