import { DatabaseSync } from 'node:sqlite'
import { CATEGORIES_MIGRATION, createCategoryService } from '@wsfg/core/categories'
import { AiError, type ServerServices } from '@wsfg/core/contract'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_QUESTION_LIST, DEFAULT_QUESTIONS } from '../server/default-questions.ts'
import { ballpark } from '../server/index.ts'
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
import { defaultSettings, type BallparkSettings } from '../shared/index.ts'

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
    gameId: 'ballpark',
    db,
    ai: null,
    logger: { info() {}, warn() {}, error() {} },
    categories: createCategoryService(db, 'ballpark'),
  }
}

beforeEach(() => useDb(freshDb()))

const q = (category: string, question: string, answer = 1, unit: string | null = null, fact: string | null = null) => ({
  category,
  question,
  answer,
  unit,
  fact,
})
const questions = [
  q('Landmarks', 'How tall is the Eiffel Tower?', 330, 'm', 'Including the antennas'),
  q('Landmarks', 'How tall is Big Ben?', 96, 'm'),
  q('History', 'In what year did the Titanic sink?', 1912),
]
const idOf = (name: string) => services.categories.findByName(name)!.id

describe('migration 002: default questions', () => {
  it('seeds every starter question as builtin, in its own categories, with answers, units and facts', () => {
    useDb(freshDb({ seed: true }))
    expect(listQuestions(db, { limit: 200 }).total).toBe(DEFAULT_QUESTION_LIST.length)
    expect(listCategories(db).map((c) => c.category).sort()).toEqual(Object.keys(DEFAULT_QUESTIONS).sort())
    expect(db.prepare('SELECT DISTINCT source FROM ballpark_questions').all()).toEqual([{ source: 'builtin' }])
    const eiffel = listQuestions(db, { q: 'Eiffel Tower?' }).questions[0]!
    expect(eiffel).toMatchObject({ answer: 330, unit: 'm', fact: 'Including the antennas on top' })
    const titanic = listQuestions(db, { q: 'Titanic sink?' }).questions[0]!
    expect(titanic).toMatchObject({ answer: 1912, unit: null, fact: null })
  })

  it('keeps an existing library and only adds what is missing', () => {
    addQuestions(services, [q('history', 'How old is history?', 5)])
    db.exec(migrations.find((m) => m.id === SEED_ID)!.sql)
    expect(listCategories(db).filter((c) => c.category.toLowerCase() === 'history')).toHaveLength(1)
    expect(listQuestions(db, { limit: 200 }).total).toBe(DEFAULT_QUESTION_LIST.length + 1)
  })

  it('every starter question passes validation', () => {
    expect(addQuestions(services, DEFAULT_QUESTION_LIST).skipped).toEqual([])
  })
})

describe('addQuestions', () => {
  it('inserts, creating categories, and skips duplicates and invalid entries', () => {
    const result = addQuestions(services, [
      ...questions,
      q('landmarks', 'how tall is BIG BEN?', 96, 'm'),
      q('Landmarks', 'How wide is it?', 1, 'ft'),
    ])
    expect(result).toMatchObject({
      inserted: 3,
      createdCategories: ['Landmarks', 'History'],
      insertedByCategory: { Landmarks: 2, History: 1 },
      skipped: [
        { question: 'how tall is BIG BEN?', reason: 'Already in the library' },
        { question: 'How wide is it?', reason: 'Unknown unit "ft"' },
      ],
    })
  })
})

describe('listing, editing and removing', () => {
  beforeEach(() => void addQuestions(services, questions))

  it('lists and filters by category and text', () => {
    expect(listQuestions(db).total).toBe(3)
    expect(listQuestions(db, { category: 'landmarks' }).questions.map((r) => r.question)).toEqual([
      'How tall is Big Ben?',
      'How tall is the Eiffel Tower?',
    ])
    expect(listQuestions(db, { categoryId: idOf('History') }).total).toBe(1)
    expect(listQuestions(db, { q: 'EIFFEL' }).questions[0]).toMatchObject({ answer: 330, unit: 'm', fact: 'Including the antennas' })
  })

  it('lists categories with counts, including empty ones', () => {
    services.categories.create('Empty')
    expect(listCategories(db)).toEqual([
      { id: idOf('Empty'), category: 'Empty', total: 0, unused: 0 },
      { id: idOf('History'), category: 'History', total: 1, unused: 1 },
      { id: idOf('Landmarks'), category: 'Landmarks', total: 2, unused: 2 },
    ])
    expect(playableCategories(db)).toEqual([
      { category: 'History', total: 1 },
      { category: 'Landmarks', total: 2 },
    ])
    expect(categoryUsage(db)).toEqual({ [idOf('History')]: 1, [idOf('Landmarks')]: 2 })
  })

  it('edits answers, units and facts, and moves questions, refusing clashes', () => {
    const benId = listQuestions(db, { q: 'Big Ben' }).questions[0]!.id
    expect(updateQuestion(services, benId, { answer: 96.3, fact: 'To the top of the spire' })).toMatchObject({
      ok: true,
      value: { answer: 96.3, unit: 'm', fact: 'To the top of the spire' },
    })
    expect(updateQuestion(services, benId, { unit: null, fact: null })).toMatchObject({ ok: true, value: { unit: null, fact: null } })
    expect(updateQuestion(services, benId, { categoryId: idOf('History') })).toMatchObject({ ok: true, value: { category: 'History' } })
    expect(updateQuestion(services, benId, { question: 'In what year did the Titanic sink?' })).toEqual({
      ok: false,
      error: 'That question is already in History',
    })
    expect(updateQuestion(services, benId, { unit: 'ft' })).toEqual({ ok: false, error: 'Unknown unit "ft"' })
    expect(updateQuestion(services, 999, { answer: 1 })).toEqual({ ok: false, error: 'No such question' })
  })

  it('removes by id, and a category with questions cannot be deleted', () => {
    const ids = listQuestions(db, { category: 'Landmarks' }).questions.map((r) => r.id)
    expect(() => services.categories.remove(idOf('Landmarks'))).toThrow(/still has/)
    expect(removeQuestions(db, ids)).toBe(2)
    services.categories.remove(idOf('Landmarks'))
    expect(listQuestions(db).total).toBe(1)
  })
})

describe('pickQuestion', () => {
  beforeEach(() => void addQuestions(services, questions))

  it('picks the least used, marks it used, and honours category and exclusions', () => {
    const first = pickQuestion(db, { category: 'Landmarks' })!
    expect(first.category).toBe('Landmarks')
    const second = pickQuestion(db, { category: 'Landmarks' })!
    expect(second.id).not.toBe(first.id)
    expect(pickQuestion(db, { category: 'Landmarks', excludeIds: [first.id, second.id] })).toBeNull()
    expect(listCategories(db).find((c) => c.category === 'Landmarks')!.unused).toBe(0)
  })
})

describe('prepareRound', () => {
  const players = [{ id: 'p1', name: 'A', connected: true, isLoggedIn: true }]
  const prepare = (settings: Partial<BallparkSettings>, request: Parameters<NonNullable<typeof ballpark.prepareRound>>[0]) =>
    ballpark.prepareRound!(request, { settings: { ...defaultSettings, ...settings }, players, services })
  const state = (usedQuestionIds: number[]) => ({ usedQuestionIds }) as never

  it('returns nothing for actions that do not start a round', async () => {
    addQuestions(services, questions)
    const request = { trigger: 'action', state: state([]), action: { type: 'submit_guess', value: 1 }, actorId: 'p1' } as const
    expect(await prepare({}, request)).toBeUndefined()
  })

  it('picks a library question with its answer, excluding ones used in this room', async () => {
    addQuestions(services, questions)
    const a = (await prepare({ category: 'History' }, { trigger: 'init' })) as { id: number }
    expect(a).toEqual({ id: a.id, category: 'History', text: 'In what year did the Titanic sink?', answer: 1912, unit: null, fact: null })
    const b = await prepare({ category: 'Landmarks' }, { trigger: 'action', state: state([]), action: { type: 'next_round' }, actorId: 'p1' })
    const c = await prepare({ category: 'Landmarks' }, { trigger: 'action', state: state([(b as { id: number }).id]), action: { type: 'new_game' }, actorId: 'p1' })
    expect((c as { id: number }).id).not.toBe((b as { id: number }).id)
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

  it('adds (with a no-spoilers note), searches, edits and removes questions', async () => {
    expect(await tool('add_questions').handler({ questions })).toMatchObject({ inserted: 3, note: expect.stringContaining('secret') })
    const found = (await tool('search_questions').handler({ query: 'Big Ben' })) as { questions: { id: number }[] }
    const id = found.questions[0]!.id
    expect(await tool('update_question').handler({ id, category: 'Towers', answer: 96.3 })).toMatchObject({ category: 'Towers', answer: 96.3 })
    expect(await tool('update_question').handler({ id, unit: null })).toMatchObject({ unit: null, answer: 96.3 })
    expect(await tool('list_categories').handler({})).toContainEqual(expect.objectContaining({ category: 'Towers', runningLow: true }))
    expect(await tool('remove_questions').handler({ ids: [id] })).toEqual({ removed: 1 })
    await expect(tool('update_question').handler({ id, answer: 2 })).rejects.toThrow('No such question')
  })
})

describe('generateQuestions', () => {
  const entry = (question: string, answer = 10, category = 'Space') => ({ category, question, answer, unit: 'km', fact: null })
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
    addQuestions(services, [entry('How far is the Moon?')])
    const { ai, calls } = fakeAi({
      questions: [
        entry('How far is the Moon?'),
        entry('How wide is Mars?'),
        entry('how wide is MARS?'),
        entry('How wide is Venus?'),
        entry('How wide is Pluto?'),
      ],
    })
    const result = await generateQuestions(ai, services, { count: 2, category: 'space', instructions: 'Really easy, for young kids', userId: 'a1' })
    expect(result.candidates).toEqual([entry('How wide is Mars?'), entry('How wide is Venus?')])
    expect(result.skipped.map((s) => s.question)).toEqual(['How far is the Moon?', 'how wide is MARS?'])
    expect(JSON.stringify(calls[0])).toContain('How far is the Moon?') // avoid-list in the prompt
    expect(JSON.stringify(calls[0])).toContain('Extra instructions from the admin (follow them, within the rules above): Really easy, for young kids')
    expect(listQuestions(db).total).toBe(1) // nothing saved
  })

  it('retries once on an invalid response, then errors; cap errors are final', async () => {
    const ok = fakeAi(new AiError('invalid', 'bad'), { questions: [entry('How wide is Mars?')] })
    expect((await generateQuestions(ok.ai, services, { count: 1, userId: null })).candidates).toHaveLength(1)
    expect(ok.calls).toHaveLength(2)

    const bad = fakeAi({ questions: [entry('Hi?')] }, { questions: [] })
    await expect(generateQuestions(bad.ai, services, { count: 1, userId: null })).rejects.toMatchObject({ code: 'invalid' })
    expect(bad.calls).toHaveLength(2)

    const capped = fakeAi(new AiError('cap', 'budget'))
    await expect(generateQuestions(capped.ai, services, { count: 5, userId: null })).rejects.toMatchObject({ code: 'cap' })
    expect(capped.calls).toHaveLength(1)
  })

  it('the MCP generate tool saves what it generates', async () => {
    const { ai } = fakeAi({ questions: [entry('How wide is Mars?'), entry('How wide is Venus?')] })
    const generate = mcpTools({ ...services, ai }).find((t) => t.name === 'generate_questions')!
    expect(await generate.handler({ count: 2, category: 'Space' })).toMatchObject({ inserted: 2, createdCategories: ['Space'] })
    expect(listQuestions(db, { category: 'Space' }).total).toBe(2)
  })
})
