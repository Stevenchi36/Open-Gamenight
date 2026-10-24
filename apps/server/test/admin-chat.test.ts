/** The admin Assistant through the real app (core guard + chat loop), with a fake AI client. */
import type Anthropic from '@anthropic-ai/sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ChatEvent } from '../src/chat.ts'
import { FakeAnthropic } from './helpers/fake-ai.ts'
import { startTestServer, type TestServer } from './helpers/server.ts'

let t: TestServer
let noAi: TestServer
let admin: string
let otherAdmin: string
let user: string
const fake = new FakeAnthropic()

beforeAll(async () => {
  t = await startTestServer({ aiClient: fake, env: { AI_CHAT_MESSAGES_PER_HOUR: '8' } })
  await t.createUser('admin@example.com', 'admin')
  await t.createUser('admin2@example.com', 'admin')
  await t.createUser('user@example.com', 'user')
  admin = await t.signIn('admin@example.com')
  otherAdmin = await t.signIn('admin2@example.com')
  user = await t.signIn('user@example.com')
  noAi = await startTestServer()
  await noAi.createUser('admin@example.com', 'admin')
}, 30_000)
afterAll(async () => {
  await t.close()
  await noAi.close()
})

const send = (server: TestServer, body: unknown, init: { cookie?: string; headers?: Record<string, string> } = {}) =>
  server.fetch('/api/admin/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })

async function events(res: Response): Promise<ChatEvent[]> {
  expect(res.headers.get('content-type')).toContain('application/x-ndjson')
  return (await res.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ChatEvent)
}

const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input, caller: { type: 'direct' } })
const text = (value: string) => ({ type: 'text', text: value, citations: null })

describe('POST /api/admin/chat', () => {
  it('is admin-only, same-origin only, and never reaches the AI otherwise', async () => {
    const before = fake.requests.length
    expect((await send(t, { message: 'hi' })).status).toBe(401)
    expect((await send(t, { message: 'hi' }, { cookie: user })).status).toBe(403)
    expect((await send(t, { message: 'hi' }, { cookie: admin, headers: { origin: 'https://evil.example' } })).status).toBe(403)
    expect((await send(t, { message: '   ' }, { cookie: admin })).status).toBe(400)
    expect(fake.requests.length).toBe(before)
  })

  it('is off without an API key', async () => {
    const cookie = await noAi.signIn('admin@example.com')
    expect((await send(noAi, { message: 'hi' }, { cookie })).status).toBe(404)
  })

  it('runs the library tools Claude asks for and streams each step', async () => {
    fake.reply(
      { content: [text('Adding them now.'), toolUse('toolu_a', 'imposter_add_words', { words: [
        { category: 'Space', word: 'Comet', hint: 'Tail' },
        { category: 'Space', word: 'Saturn', hint: 'Rings' },
      ] })] },
      { content: [text('Added 2 words to Space.')] },
    )
    const res = await send(t, { message: 'Add Comet and Saturn to Space' }, { cookie: admin })
    expect(res.status).toBe(200)
    const got = await events(res)
    expect(got.slice(0, -1)).toEqual([
      { type: 'text', text: 'Adding them now.' },
      { type: 'tool', name: 'imposter_add_words', label: 'Word Imposter: add words', ok: true },
      { type: 'text', text: 'Added 2 words to Space.' },
    ])
    expect(got.at(-1)).toMatchObject({ type: 'done', conversationId: expect.any(String) })

    const words = t.booted.gamesDb.prepare("SELECT word FROM imposter_words WHERE word IN ('Comet', 'Saturn') ORDER BY word").all()
    expect(words).toEqual([{ word: 'Comet' }, { word: 'Saturn' }])

    const [first, second] = fake.requests.slice(-2) as [Anthropic.MessageCreateParamsNonStreaming, Anthropic.MessageCreateParamsNonStreaming]
    expect(first.model).toBe('claude-opus-5-5')
    const names = first.tools!.map((tool) => (tool as Anthropic.Tool).name)
    expect(names).toEqual(expect.arrayContaining(['imposter_add_words', 'imposter_delete_category', 'ballpark_add_questions', 'flock_add_questions']))
    expect(names.filter((n) => n.includes('generate'))).toEqual([]) // Claude writes entries itself here
    // The full assistant turn goes back unchanged, followed by the tool result.
    expect(second.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect((second.messages[2]!.content as Anthropic.ToolResultBlockParam[])[0]).toMatchObject({ tool_use_id: 'toolu_a' })

    const usage = t.booted.gamesDb.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE game_id = 'chat'").get() as { n: number }
    expect(usage.n).toBeGreaterThanOrEqual(2)
  })

  it('continues a conversation, reports bad tool input to Claude, and keeps chats per admin', async () => {
    fake.reply({ content: [text('Hello!')] })
    const start = await events(await send(t, { message: 'Hi' }, { cookie: admin }))
    const conversationId = (start.at(-1) as { conversationId: string }).conversationId

    fake.reply({ content: [toolUse('toolu_b', 'imposter_add_words', { words: 'nope' })] }, { content: [text('That failed.')] })
    const next = await events(await send(t, { conversationId, message: 'Add something' }, { cookie: admin }))
    expect(next[0]).toMatchObject({ type: 'tool', name: 'imposter_add_words', ok: false, error: expect.stringContaining('Invalid input') })
    const sent = fake.requests.at(-1)!
    expect(sent.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
    expect((sent.messages[4]!.content as Anthropic.ToolResultBlockParam[])[0]).toMatchObject({ is_error: true })

    expect((await send(t, { conversationId, message: 'Mine now' }, { cookie: otherAdmin })).status).toBe(404)
    expect((await send(t, { conversationId: 'gone', message: 'Hi' }, { cookie: admin })).status).toBe(404)
  })

  it('shows AI errors in the stream and limits messages per admin per hour', async () => {
    fake.reply(new Error('network down'))
    const failed = await events(await send(t, { message: 'Hi' }, { cookie: otherAdmin }))
    expect(failed[0]).toMatchObject({ type: 'error' })
    expect(failed.at(-1)).toMatchObject({ type: 'done' })

    let status = 200
    for (let i = 0; i < 10 && status === 200; i++) {
      fake.reply({ content: [text('ok')] })
      const res = await send(t, { message: 'again' }, { cookie: otherAdmin })
      status = res.status
      await res.text()
    }
    expect(status).toBe(429)
  })
})
