/** Imposter admin routes through the real app (core guard + game router), with a fake AI client. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
    })

    const cats = (await (await t.fetch('/api/admin/imposter/categories', { cookie: admin })).json()) as {
      categories: { category: string; unused: number; runningLow: boolean }[]
      aiEnabled: boolean
    }
    expect(cats.aiEnabled).toBe(true)
    expect(cats.categories).toEqual([{ category: 'Space', total: 2, unused: 2, runningLow: true }])

    const list = (await (await t.fetch('/api/admin/imposter/words?q=tail', { cookie: admin })).json()) as {
      total: number
      words: { id: number; source: string }[]
    }
    expect(list).toMatchObject({ total: 1, words: [{ source: 'manual' }] })

    const del = await t.fetch('/api/admin/imposter/words', { method: 'DELETE', cookie: admin, ...json({ ids: [list.words[0]!.id] }) })
    expect(await del.json()).toEqual({ removed: 1 })
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

  it('returns 503 for generation when AI is not configured', async () => {
    const cookie = await noAi.signIn('admin@example.com')
    const res = await noAi.fetch('/api/admin/imposter/words/generate', { method: 'POST', cookie, ...json({ count: 3 }) })
    expect(res.status).toBe(503)
    expect(await (await noAi.fetch('/api/admin/ai/usage', { cookie })).json()).toEqual({ enabled: false })
  })
})
