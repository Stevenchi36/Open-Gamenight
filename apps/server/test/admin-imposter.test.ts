/** Imposter admin routes through the real app (core guard + game router), with a fake AI client. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServices } from '../src/app.ts'
import { FakeAnthropic } from './helpers/fake-ai.ts'
import { startTestServer, type TestServer } from './helpers/server.ts'

let t: TestServer
let noAi: TestServer
let admin: string
let user: string
const fake = new FakeAnthropic()

const json = (body: unknown) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

beforeAll(async () => {
  t = await startTestServer({ aiClient: fake })
  await t.createUser('admin@example.com', 'admin')
  await t.createUser('user@example.com', 'user')
  admin = await t.signIn('admin@example.com')
  user = await t.signIn('user@example.com')
  noAi = await startTestServer()
  await noAi.createUser('admin@example.com', 'admin')
}, 30_000)
afterAll(async () => {
  await t.close()
  await noAi.close()
})

describe('/api/admin/imposter', () => {
  it('is admin-only', async () => {
    expect((await t.fetch('/api/admin/imposter/words')).status).toBe(401)
    expect((await t.fetch('/api/admin/imposter/words', { cookie: user })).status).toBe(403)
    expect((await t.fetch('/api/admin/imposter/words', { cookie: admin })).status).toBe(200)
  })

  it('never calls the AI for guests, non-admins or cross-site requests', async () => {
    const before = fake.requests.length
    const generate = (init: { cookie?: string; headers?: Record<string, string> } = {}) =>
      t.fetch('/api/admin/imposter/words/generate', {
        method: 'POST',
        ...json({ count: 5 }),
        ...init,
        headers: { 'content-type': 'application/json', ...init.headers },
      })
    expect((await generate()).status).toBe(401)
    expect((await generate({ cookie: user })).status).toBe(403)
    expect((await generate({ cookie: admin, headers: { origin: 'https://evil.example' } })).status).toBe(403)
    expect(fake.requests.length).toBe(before)
  })

  it('gives the AI service only to admin code, never to gameplay or public routes', () => {
    const imposter = t.booted.games.find((g) => g.id === 'imposter')!
    expect(createServices(t.booted, imposter).ai).toBeNull()
    expect(createServices(t.booted, imposter, { admin: true }).ai).not.toBeNull()
  })

  it('adds, lists, flags low stock and removes words', async () => {
    const added = await t.fetch('/api/admin/imposter/words', {
      method: 'POST',
      cookie: admin,
      ...json({
        words: [
          { category: 'Space', word: 'Comet', hint: 'Has a long tail' },
          { category: 'Space', word: 'Saturn', hint: 'Wears rings' },
          { category: 'Space', word: 'Comet', hint: 'Duplicate' },
          { category: 'Space', word: 'Moon', hint: 'The moon at night' },
        ],
      }),
    })
    expect(await added.json()).toMatchObject({
      inserted: 2,
      skipped: [{ reason: 'Already in the library' }, { reason: 'Hint must not contain the word' }],
      createdCategories: ['Space'],
    })

    const cats = (await (await t.fetch('/api/admin/imposter/categories', { cookie: admin })).json()) as {
      categories: { id: number; category: string; unused: number; runningLow: boolean }[]
      aiEnabled: boolean
    }
    expect(cats.aiEnabled).toBe(true)
    expect(cats.categories).toEqual([{ id: expect.any(Number), category: 'Space', total: 2, unused: 2, runningLow: true }])

    const list = (await (await t.fetch('/api/admin/imposter/words?q=tail', { cookie: admin })).json()) as {
      total: number
      words: { id: number; source: string }[]
    }
    expect(list).toMatchObject({ total: 1, words: [{ source: 'manual' }] })

    const del = await t.fetch('/api/admin/imposter/words', { method: 'DELETE', cookie: admin, ...json({ ids: [list.words[0]!.id] }) })
    expect(await del.json()).toEqual({ removed: 1 })
  })

  it('clears used words in one category, or in all of them', async () => {
    await t.fetch('/api/admin/imposter/words', {
      method: 'POST',
      cookie: admin,
      ...json({
        words: [
          { category: 'Weather', word: 'Rainbow', hint: 'Colours' },
          { category: 'Weather', word: 'Thunder', hint: 'Loud' },
          { category: 'Tools', word: 'Hammer', hint: 'Nails' },
        ],
      }),
    })
    const { db } = createServices(t.booted, t.booted.games.find((g) => g.id === 'imposter')!)
    db.exec("UPDATE imposter_words SET times_used = 1 WHERE word IN ('Rainbow', 'Hammer')")
    const ids = (await (await t.fetch('/api/admin/imposter/categories', { cookie: admin })).json()) as {
      categories: { id: number; category: string }[]
    }
    const weather = ids.categories.find((c) => c.category === 'Weather')!.id
    const clear = (body: unknown) => t.fetch('/api/admin/imposter/words/used', { method: 'DELETE', cookie: admin, ...json(body) })
    expect((await clear({ categoryId: 'x' })).status).toBe(400)
    expect(await (await clear({ categoryId: weather })).json()).toEqual({ removed: 1 })
    expect(await (await clear({})).json()).toEqual({ removed: 1 })
    const left = db.prepare("SELECT word FROM imposter_words WHERE word IN ('Rainbow', 'Thunder', 'Hammer')").all()
    expect(left).toEqual([{ word: 'Thunder' }])
  })

  it('validates request bodies', async () => {
    const res = await t.fetch('/api/admin/imposter/words', { method: 'POST', cookie: admin, ...json({ words: [] }) })
    expect(res.status).toBe(400)
    const gen = await t.fetch('/api/admin/imposter/words/generate', { method: 'POST', cookie: admin, ...json({ count: 51 }) })
    expect(gen.status).toBe(400)
  })

  it('generates candidates for review without saving them', async () => {
    fake.reply({
      input: {
        words: [
          { category: 'Space', word: 'Nebula', hint: 'A colourful cloud far away', difficulty: 'medium' },
          { category: 'Space', word: 'Saturn', hint: 'Already there', difficulty: 'easy' },
          { category: 'Space', word: 'Rocket', hint: 'A rocket ship', difficulty: 'easy' },
          { category: 'Oceans', word: 'Astronaut', hint: 'Floats in orbit', difficulty: 'easy' },
        ],
      },
    })
    const res = await t.fetch('/api/admin/imposter/words/generate', {
      method: 'POST',
      cookie: admin,
      ...json({ count: 5, category: 'Space' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { candidates: { word: string; category: string }[]; skipped: { reason: string }[] }
    expect(body.candidates).toEqual([
      { category: 'Space', word: 'Nebula', hint: 'A colourful cloud far away', difficulty: 'medium' },
      { category: 'Space', word: 'Astronaut', hint: 'Floats in orbit', difficulty: 'easy' }, // category forced to the request
    ])
    expect(body.skipped.map((s) => s.reason)).toEqual(['Already in the library', 'Hint must not contain the word'])

    // nothing was saved, and the prompt carried the avoid-list
    const list = (await (await t.fetch('/api/admin/imposter/words?q=Nebula', { cookie: admin })).json()) as { total: number }
    expect(list.total).toBe(0)
    expect(JSON.stringify(fake.requests.at(-1)!.messages)).toContain('Saturn')

    const usage = (await (await t.fetch('/api/admin/ai/usage', { cookie: admin })).json()) as { enabled: boolean; calls: number }
    expect(usage).toMatchObject({ enabled: true, calls: 1 })
  })

  it('with save: true, saves the words and returns counts only (no spoilers)', async () => {
    fake.reply({
      input: {
        words: [
          { category: 'Space', word: 'Quasar', hint: 'Bright', difficulty: 'hard' },
          { category: 'Space', word: 'Saturn', hint: 'Already there', difficulty: 'easy' },
          { category: 'Insects', word: 'Beetle', hint: 'Crunchy', difficulty: 'easy' },
          { category: 'Insects', word: 'Wasp', hint: 'Buzz', difficulty: 'easy' },
        ],
      },
    })
    const res = await t.fetch('/api/admin/imposter/words/generate', { method: 'POST', cookie: admin, ...json({ count: 5, save: true }) })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({
      inserted: 3,
      insertedByCategory: { Space: 1, Insects: 2 },
      createdCategories: ['Insects'],
      skippedCount: 1,
    })
    for (const word of ['Quasar', 'Saturn', 'Beetle', 'Wasp', 'Bright', 'Crunchy']) expect(text).not.toContain(word)

    const list = (await (await t.fetch('/api/admin/imposter/words?q=Quasar', { cookie: admin })).json()) as {
      words: { source: string }[]
    }
    expect(list.words).toMatchObject([{ source: 'claude' }])
  })

  it('returns 503 for generation when AI is not configured', async () => {
    const cookie = await noAi.signIn('admin@example.com')
    const res = await noAi.fetch('/api/admin/imposter/words/generate', { method: 'POST', cookie, ...json({ count: 3 }) })
    expect(res.status).toBe(503)
    expect(await (await noAi.fetch('/api/admin/ai/usage', { cookie })).json()).toEqual({ enabled: false })
  })
})

describe('/api/admin/categories/imposter', () => {
  const base = '/api/admin/categories/imposter'
  type Cat = { id: number; name: string; count: number }
  const list = async () => ((await (await t.fetch(base, { cookie: admin })).json()) as { categories: Cat[] }).categories
  const send = (path: string, method: string, body?: unknown) =>
    t.fetch(path, { method, cookie: admin, ...(body === undefined ? {} : json(body)) })

  it('is admin-only and 404s for games without categories', async () => {
    expect((await t.fetch(base)).status).toBe(401)
    expect((await t.fetch(base, { cookie: user })).status).toBe(403)
    expect((await t.fetch('/api/admin/categories/nope', { cookie: admin })).status).toBe(404)
  })

  it('creates, renames, lists with counts, and only deletes empty categories', async () => {
    const created = await send(base, 'POST', { name: 'Board Games' })
    expect(created.status).toBe(200)
    const board = (await created.json()) as Cat
    expect((await send(base, 'POST', { name: 'board games' })).status).toBe(409)
    expect((await send(base, 'POST', { name: '' })).status).toBe(400)

    const renamed = await send(`${base}/${board.id}`, 'PATCH', { name: 'Games' })
    expect(await renamed.json()).toMatchObject({ id: board.id, name: 'Games' })

    // a word in the category: the list shows its count and delete is refused
    const add = await send('/api/admin/imposter/words', 'POST', {
      words: [{ category: 'Games', word: 'Chess', hint: 'Kings and queens' }],
    })
    expect(await add.json()).toMatchObject({ inserted: 1, createdCategories: [] })
    expect((await list()).find((c) => c.id === board.id)).toMatchObject({ name: 'Games', count: 1 })
    const refused = await send(`${base}/${board.id}`, 'DELETE')
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ error: 'in_use' })

    // move the word out, then delete works
    const found = (await (await t.fetch('/api/admin/imposter/words?q=Chess', { cookie: admin })).json()) as {
      words: { id: number }[]
    }
    const space = (await list()).find((c) => c.name === 'Space')!
    const moved = await send(`/api/admin/imposter/words/${found.words[0]!.id}`, 'PATCH', { categoryId: space.id })
    expect(await moved.json()).toMatchObject({ category: 'Space', word: 'Chess' })
    expect((await send(`${base}/${board.id}`, 'DELETE')).status).toBe(200)
    expect((await list()).some((c) => c.id === board.id)).toBe(false)
  })

  it('filters words by category id and rejects bad edits', async () => {
    const space = (await list()).find((c) => c.name === 'Space')!
    const words = (await (await t.fetch(`/api/admin/imposter/words?categoryId=${space.id}`, { cookie: admin })).json()) as {
      total: number
      words: { id: number; category: string }[]
    }
    expect(words.total).toBeGreaterThan(0)
    expect(words.words.every((w) => w.category === 'Space')).toBe(true)
    expect((await send(`/api/admin/imposter/words/${words.words[0]!.id}`, 'PATCH', { categoryId: 99999 })).status).toBe(404)
  })
})
