import { DatabaseSync } from 'node:sqlite'
import { CATEGORIES_MIGRATION, createCategoryService } from '@wsfg/core/categories'
import { AiError, type ServerServices } from '@wsfg/core/contract'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_QUESTION_LIST, DEFAULT_QUESTIONS } from '../server/default-questions.ts'
import { flock } from '../server/index.ts'
import {
  addQuestions,
  categoryUsage,
  generateQuestions,
  listCategories,
  listQuestions,
  pickQuestion,
  playableCategories,
  removeQuestions,
  updateQuestion,
} from '../server/library.ts'
import { migrations } from '../server/migrations.ts'
import { mcpTools } from '../server/mcp.ts'
import { defaultSettings, type FlockSettings } from '../shared/index.ts'

let db: DatabaseSync
let services: ServerServices

const SEED_ID = '002_default_questions'

/** Same order as the server: core tables first, then the game's migrations. Empty library unless `seed`. */
function freshDb({ seed = false } = {}) {
  const d = new DatabaseSync(':memory:')
  d.exec('PRAGMA foreign_keys = ON')
  d.exec(CATEGORIES_MIGRATION.sql)
  for (const m of migrations) if (seed || m.id !== SEED_ID) d.exec(m.sql)
  return d
}

function useDb(d: DatabaseSync) {
  db = d
  services = {
    gameId: 'flock',
    db,
    ai: null,
    logger: { info() {}, warn() {}, error() {} },
    categories: createCategoryService(db, 'flock'),
  }
}

beforeEach(() => useDb(freshDb()))

const questions = [
  { category: 'Food', question: 'Name a breakfast cereal' },
  { category: 'Food', question: 'Name a pizza topping' },
  { category: 'Animals', question: 'Name a pet' },
]
const idOf = (name: string) => services.categories.findByName(name)!.id

describe('migration 002: default questions', () => {
  it('seeds every starter question as builtin, in its own categories', () => {
    useDb(freshDb({ seed: true }))
    expect(listQuestions(db, { limit: 200 }).total).toBe(DEFAULT_QUESTION_LIST.length)
    expect(listCategories(db).map((c) => c.category).sort()).toEqual(Object.keys(DEFAULT_QUESTIONS).sort())
    const sources = db.prepare('SELECT DISTINCT source FROM flock_questions').all()
    expect(sources).toEqual([{ source: 'builtin' }])
  })

  it('keeps an existing library and only adds what is missing', () => {
    addQuestions(services, [{ category: 'animals', question: 'Name a pet' }])
    db.exec(migrations.find((m) => m.id === SEED_ID)!.sql)
    // the existing lower-case category is reused, not duplicated
    expect(listCategories(db).filter((c) => c.category.toLowerCase() === 'animals')).toHaveLength(1)
    expect(listQuestions(db, { limit: 200 }).total).toBe(DEFAULT_QUESTION_LIST.length + 1)
  })

  it('every starter question passes validation', () => {
    const result = addQuestions(services, DEFAULT_QUESTION_LIST)
    expect(result.skipped).toEqual([])
  })

  it('leaves Imposter categories alone', () => {
    db.exec("INSERT INTO categories (game_id, name) VALUES ('imposter', 'Animals')")
    db.exec(migrations.find((m) => m.id === SEED_ID)!.sql)
    expect(db.prepare("SELECT game_id FROM categories WHERE name = 'Animals' ORDER BY game_id").all()).toEqual([
      { game_id: 'flock' },
      { game_id: 'imposter' },
    ])
  })
})

describe('addQuestions', () => {
  it('inserts, creating categories, and skips duplicates and invalid entries', () => {
    const result = addQuestions(services, [
      ...questions,
      { category: 'food', question: 'name a BREAKFAST cereal' },
      { category: 'Food', question: 'Hi' },
    ])
    expect(result).toMatchObject({
      inserted: 3,
      createdCategories: ['Food', 'Animals'],
      insertedByCategory: { Food: 2, Animals: 1 },
      skipped: [
        { question: 'name a BREAKFAST cereal', reason: 'Already in the library' },
        { question: 'Hi', reason: 'Question must be at least 5 characters' },
      ],
    })
  })
})

describe('category spelling', () => {
  it('adds to an existing category spelled differently instead of creating another', () => {
    addQuestions(services, [{ category: 'Food & Drink', question: 'Name a breakfast cereal' }])
    expect(addQuestions(services, [{ category: 'food and drinks', question: 'Name a fizzy drink' }])).toMatchObject({
      inserted: 1,
      createdCategories: [],
      insertedByCategory: { 'Food & Drink': 1 },
    })
  })
})

describe('listing, editing and removing', () => {
  beforeEach(() => void addQuestions(services, questions))

  it('lists and filters by category and text', () => {
    expect(listQuestions(db).total).toBe(3)
    expect(listQuestions(db, { category: 'food' }).questions.map((q) => q.question)).toEqual([
      'Name a breakfast cereal',
      'Name a pizza topping',
    ])
    expect(listQuestions(db, { categoryId: idOf('Animals') }).total).toBe(1)
    expect(listQuestions(db, { q: 'PIZZA' }).questions[0]!.question).toBe('Name a pizza topping')
    expect(listQuestions(db, { q: '%' }).total).toBe(0)
  })

  it('lists categories with counts, including empty ones', () => {
    services.categories.create('Empty')
    expect(listCategories(db)).toEqual([
      { id: idOf('Animals'), category: 'Animals', total: 1, unused: 1 },
      { id: idOf('Empty'), category: 'Empty', total: 0, unused: 0 },
      { id: idOf('Food'), category: 'Food', total: 2, unused: 2 },
    ])
    expect(playableCategories(db)).toEqual([
      { category: 'Animals', total: 1 },
      { category: 'Food', total: 2 },
    ])
    expect(categoryUsage(db)).toEqual({ [idOf('Animals')]: 1, [idOf('Food')]: 2 })
  })

  it('edits and moves a question, refusing clashes', () => {
    const pet = listQuestions(db, { q: 'pet' }).questions[0]!
    const moved = updateQuestion(services, pet.id, { categoryId: idOf('Food'), question: 'Name a  pet food' })
    expect(moved).toMatchObject({ ok: true, value: { category: 'Food', question: 'Name a pet food' } })
    expect(updateQuestion(services, pet.id, { question: 'Name a pizza topping' })).toEqual({
      ok: false,
      error: 'That question is already in Food',
    })
    expect(updateQuestion(services, 999, { question: 'Name a thing' })).toEqual({ ok: false, error: 'No such question' })
  })

  it('removes by id, and a category with questions cannot be deleted', () => {
    const ids = listQuestions(db, { category: 'Food' }).questions.map((q) => q.id)
    expect(() => services.categories.remove(idOf('Food'))).toThrow(/still has/)
    expect(removeQuestions(db, ids)).toBe(2)
    services.categories.remove(idOf('Food'))
    expect(listQuestions(db).total).toBe(1)
  })
})

describe('pickQuestion', () => {
  beforeEach(() => void addQuestions(services, questions))

  it('picks the least used, marks it used, and honours category and exclusions', () => {
    const first = pickQuestion(db, { category: 'Food' })!
    expect(first.category).toBe('Food')
    const second = pickQuestion(db, { category: 'Food' })!
    expect(second.id).not.toBe(first.id) // the other one is less used now
    expect(pickQuestion(db, { category: 'Food', excludeIds: [first.id, second.id] })).toBeNull()
    expect(listCategories(db).find((c) => c.category === 'Food')!.unused).toBe(0)
  })
})

describe('prepareRound', () => {
  const players = [{ id: 'p1', name: 'A', connected: true, isLoggedIn: true }]
  const prepare = (settings: Partial<FlockSettings>, request: Parameters<NonNullable<typeof flock.prepareRound>>[0]) =>
    flock.prepareRound!(request, { settings: { ...defaultSettings, ...settings }, players, services })
  const state = (usedQuestionIds: number[]) => ({ usedQuestionIds }) as never

  it('returns nothing for actions that do not start a round', async () => {
    addQuestions(services, questions)
    const request = { trigger: 'action', state: state([]), action: { type: 'submit_answer', text: 'x' }, actorId: 'p1' } as const
    expect(await prepare({}, request)).toBeUndefined()
  })

  it('picks a library question, excluding ones used in this room', async () => {
    addQuestions(services, questions)
    const a = (await prepare({ category: 'Food' }, { trigger: 'init' })) as { id: number; text: string }
    expect(a).toMatchObject({ category: 'Food' })
    for (const type of ['next_round', 'new_game'] as const) {
      const b = await prepare({ category: 'Food' }, { trigger: 'action', state: state([a.id]), action: { type }, actorId: 'p1' })
      expect((b as { text: string }).text).not.toBe(a.text)
    }
  })

  it('falls back to starter questions with a notice', async () => {
    expect(await prepare({}, { trigger: 'init' })).toEqual({
      builtin: true,
      notice: 'The question library is empty, so starter questions are used.',
    })
    addQuestions(services, questions)
    expect(await prepare({ category: 'Toys' }, { trigger: 'init' })).toEqual({
      builtin: true,
      notice: 'No unused questions in Toys, so starter questions are used.',
    })
  })
})

describe('MCP tools', () => {
  const tool = (name: string) => mcpTools(services).find((t) => t.name === name)!

  it('has no generate tool without the AI service', () => {
    expect(mcpTools(services).map((t) => t.name)).toEqual([
      'add_questions',
      'list_categories',
      'search_questions',
      'update_question',
      'remove_questions',
    ])
  })

  it('adds, searches, moves and removes questions', async () => {
    expect(await tool('add_questions').handler({ questions })).toMatchObject({ inserted: 3 })
    const found = (await tool('search_questions').handler({ query: 'pet' })) as { questions: { id: number }[] }
    const id = found.questions[0]!.id
    expect(await tool('update_question').handler({ id, category: 'Pets' })).toMatchObject({ category: 'Pets' })
    expect(await tool('list_categories').handler({})).toContainEqual(expect.objectContaining({ category: 'Pets', runningLow: true }))
    expect(await tool('remove_questions').handler({ ids: [id] })).toEqual({ removed: 1 })
    await expect(tool('update_question').handler({ id, question: 'Name a dog' })).rejects.toThrow('No such question')
  })
})

describe('generateQuestions', () => {
  const entry = (question: string, category = 'Space') => ({ category, question })
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
    addQuestions(services, [entry('Name a planet')])
    const { ai, calls } = fakeAi({
      questions: [entry('Name a planet'), entry('Name a famous astronaut'), entry('name a famous ASTRONAUT'), entry('Name a star'), entry('Name a moon')],
    })
    const result = await generateQuestions(ai, services, { count: 2, category: 'space', instructions: 'Really easy, for young kids', userId: 'a1' })
    expect(result.candidates).toEqual([entry('Name a famous astronaut'), entry('Name a star')])
    expect(result.skipped.map((s) => s.question)).toEqual(['Name a planet', 'name a famous ASTRONAUT'])
    expect(JSON.stringify(calls[0])).toContain('Name a planet') // avoid-list in the prompt
    expect(JSON.stringify(calls[0])).toContain('Extra instructions from the admin (follow them, within the rules above): Really easy, for young kids')
    expect(listQuestions(db).total).toBe(1) // nothing saved
  })

  it('retries once on an invalid response, then errors; cap errors are final', async () => {
    const ok = fakeAi(new AiError('invalid', 'bad'), { questions: [entry('Name a star')] })
    expect((await generateQuestions(ok.ai, services, { count: 1, userId: null })).candidates).toHaveLength(1)
    expect(ok.calls).toHaveLength(2)

    const bad = fakeAi({ questions: [entry('Hi')] }, { questions: [] })
    await expect(generateQuestions(bad.ai, services, { count: 1, userId: null })).rejects.toMatchObject({ code: 'invalid' })
    expect(bad.calls).toHaveLength(2)

    const capped = fakeAi(new AiError('cap', 'budget'))
    await expect(generateQuestions(capped.ai, services, { count: 5, userId: null })).rejects.toMatchObject({ code: 'cap' })
    expect(capped.calls).toHaveLength(1)
  })

  it('maps generated category names onto existing categories', async () => {
    services.categories.create('Space')
    const { ai } = fakeAi({ questions: [entry('Name a star', 'spaces')] })
    expect((await generateQuestions(ai, services, { count: 1, userId: null })).candidates[0]!.category).toBe('Space')
  })

  it('the MCP generate tool saves what it generates', async () => {
    const { ai } = fakeAi({ questions: [entry('Name a star'), entry('Name a comet')] })
    const generate = mcpTools({ ...services, ai }).find((t) => t.name === 'generate_questions')!
    expect(await generate.handler({ count: 2, category: 'Space' })).toMatchObject({ inserted: 2, createdCategories: ['Space'] })
    expect(listQuestions(db, { category: 'Space' }).total).toBe(2)
  })
})
