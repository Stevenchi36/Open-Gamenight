import Anthropic from '@anthropic-ai/sdk'
import { AiError } from '@ogn/core/contract'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createAiCore, type AiCore } from '../src/ai.ts'
import { migrateGamesDb, openDatabase } from '../src/db.ts'
import { createLogger } from '../src/logger.ts'
import { FakeAnthropic } from './helpers/fake-ai.ts'

const config = {
  ANTHROPIC_API_KEY: 'test',
  ANTHROPIC_MODEL: 'claude-haiku-5-5',
  AI_DAILY_OUTPUT_TOKEN_CAP: 1000,
  AI_PER_ADMIN_CALLS_PER_HOUR: 3,
}
const tool = {
  name: 'submit_things',
  description: 'Submit things',
  inputSchema: z.object({ things: z.array(z.string()) }),
}
const request = { userId: 'admin1', system: 'You list things.', prompt: 'List 2 things.', tool }

let db: ReturnType<typeof openDatabase>
let fake: FakeAnthropic
let core: AiCore

beforeEach(() => {
  db = openDatabase(':memory:')
  migrateGamesDb(db, [])
  fake = new FakeAnthropic()
  core = createAiCore({ config, db, logger: createLogger('test', 'silent'), client: fake })!
})

const usageRows = () => db.prepare('SELECT game_id, user_id, model, input_tokens, output_tokens FROM ai_usage').all()

describe('createAiCore', () => {
  it('is disabled without an API key', () => {
    expect(createAiCore({ config: { ...config, ANTHROPIC_API_KEY: undefined }, db, logger: createLogger('t', 'silent') })).toBeNull()
  })

  it('makes one strict tool call, returns the validated input and logs usage', async () => {
    fake.reply({ input: { things: ['a', 'b'] }, outputTokens: 321 })
    await expect(core.forGame('imposter').generate(request)).resolves.toEqual({ things: ['a', 'b'] })

    const [sent] = fake.requests
    expect(sent).toMatchObject({
      model: 'claude-haiku-5-5',
      system: 'You list things.',
      tool_choice: { type: 'auto' },
      tools: [{ name: 'submit_things', strict: true, input_schema: { type: 'object', additionalProperties: false } }],
    })
    expect(JSON.stringify(sent!.tools)).not.toContain('$schema')
    expect(JSON.stringify(sent!.messages)).toContain('submit_things')
    expect(usageRows()).toEqual([
      { game_id: 'imposter', user_id: 'admin1', model: 'claude-haiku-5-5', input_tokens: 100, output_tokens: 321 },
    ])
    expect(core.usageToday()).toMatchObject({ outputTokens: 321, calls: 1, cap: 1000, byGame: [{ gameId: 'imposter', calls: 1 }] })
  })

  it('refuses once the daily output-token cap is used up', async () => {
    fake.reply({ input: { things: [] }, outputTokens: 1000 })
    await core.forGame('imposter').generate(request)
    await expect(core.forGame('other').generate({ ...request, userId: 'admin2' })).rejects.toMatchObject({ code: 'cap' })
    expect(fake.requests).toHaveLength(1) // the second call never reached the API
  })

  it('limits calls per admin per hour', async () => {
    for (let i = 0; i < 3; i++) fake.reply({ input: { things: [] }, outputTokens: 1 })
    for (let i = 0; i < 3; i++) await core.forGame('imposter').generate(request)
    await expect(core.forGame('imposter').generate(request)).rejects.toMatchObject({ code: 'rate_limited' })
    fake.reply({ input: { things: [] }, outputTokens: 1 })
    await expect(core.forGame('imposter').generate({ ...request, userId: 'someone-else' })).resolves.toBeDefined()
  })

  it.each([
    ['a refusal', { stopReason: 'refusal' as const, noTool: true }, 'refused'],
    ['no tool call', { noTool: true }, 'invalid'],
    ['a malformed tool input', { input: { things: 'nope' } }, 'invalid'],
  ])('maps %s to an AiError', async (_label, reply, code) => {
    fake.reply(reply)
    const error = await core.forGame('imposter').generate(request).catch((e) => e)
    expect(error).toBeInstanceOf(AiError)
    expect(error.code).toBe(code)
    expect(usageRows()).toHaveLength(1) // still counted: tokens were spent
  })

  it('maps SDK errors by type', async () => {
    fake.reply(new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers()))
    await expect(core.forGame('imposter').generate(request)).rejects.toMatchObject({ code: 'rate_limited' })
    fake.reply(new Anthropic.InternalServerError(500, undefined, 'boom', new Headers()))
    await expect(core.forGame('imposter').generate(request)).rejects.toMatchObject({ code: 'api' })
    expect(usageRows()).toHaveLength(0)
  })
})
