/**
 * Shared AI service. One forced-in-spirit tool call per request: Claude is told
 * to call the given tool, and we return its validated input. Every call is
 * logged to ai_usage; a daily cap on output tokens (across all games and
 * admins) and a per-admin hourly call limit are enforced before calling.
 *
 * Optional: without ANTHROPIC_API_KEY there is no service (games hide generation).
 * The key stays on the server; nothing here is ever sent to a browser.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { DatabaseSync } from 'node:sqlite'
import { AiError, type AiService, type AiToolSpec, type Logger } from '@wsfg/core/contract'
import { z } from 'zod'
import type { Config } from './config.ts'

export type AiConfig = Pick<
  Config,
  'ANTHROPIC_API_KEY' | 'ANTHROPIC_MODEL' | 'AI_DAILY_OUTPUT_TOKEN_CAP' | 'AI_PER_ADMIN_CALLS_PER_HOUR'
>

/** The one SDK call we use; tests pass a fake. */
export interface MessagesClient {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> }
}

export interface AiUsageSummary {
  /** Output tokens used today (UTC). */
  outputTokens: number
  inputTokens: number
  calls: number
  cap: number
  byGame: { gameId: string; calls: number; outputTokens: number }[]
}

export interface AiCore {
  /** The AiService bound to one game (what goes into ServerServices.ai). */
  forGame(gameId: string): AiService
  /**
   * One raw Messages call for the admin chat (chat.ts runs the tool loop). Same daily
   * cap, logged to ai_usage as CHAT_USAGE_ID; the chat applies its own per-admin limit.
   */
  chat(userId: string, params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>
  usageToday(): AiUsageSummary
}

/** ai_usage.game_id for admin chat calls. */
export const CHAT_USAGE_ID = 'chat'

const MAX_TOKENS = 16_000

export function createAiCore(deps: {
  config: AiConfig
  db: DatabaseSync
  logger: Logger
  client?: MessagesClient
}): AiCore | null {
  const { config, db, logger } = deps
  if (!config.ANTHROPIC_API_KEY && !deps.client) return null
  const client: MessagesClient = deps.client ?? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })

  const usedToday = db.prepare(
    "SELECT COALESCE(SUM(output_tokens), 0) AS out FROM ai_usage WHERE created_at >= date('now')",
  )
  // Chat makes several calls per message and is limited per message instead (chat.ts).
  const callsLastHour = db.prepare(
    `SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND game_id != '${CHAT_USAGE_ID}' AND created_at >= datetime('now', '-1 hour')`,
  )
  const record = db.prepare(
    'INSERT INTO ai_usage (game_id, user_id, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)',
  )

  function checkDailyCap(): void {
    const { out } = usedToday.get() as { out: number }
    if (out >= config.AI_DAILY_OUTPUT_TOKEN_CAP) {
      throw new AiError('cap', "Today's AI budget is used up. It resets at midnight UTC.")
    }
  }

  async function chat(userId: string, params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    checkDailyCap()
    let response: Anthropic.Message
    try {
      response = await client.messages.create(params)
    } catch (error) {
      throw toAiError(error, logger)
    }
    record.run(CHAT_USAGE_ID, userId, response.model, response.usage.input_tokens, response.usage.output_tokens)
    logger.info('ai chat call', { userId, model: response.model, output_tokens: response.usage.output_tokens })
    return response
  }

  async function generate<T>(gameId: string, request: Parameters<AiService['generate']>[0] & { tool: AiToolSpec<T> }): Promise<T> {
    const { userId, system, prompt, tool } = request
    if (userId) {
      const { n } = callsLastHour.get(userId) as { n: number }
      if (n >= config.AI_PER_ADMIN_CALLS_PER_HOUR) {
        throw new AiError('rate_limited', `You've used your ${config.AI_PER_ADMIN_CALLS_PER_HOUR} generations for this hour.`)
      }
    }
    checkDailyCap()

    const { $schema: _ignored, ...inputSchema } = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>
    let response: Anthropic.Message
    try {
      response = await client.messages.create({
        model: config.ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: `${prompt}\n\nRespond by calling the ${tool.name} tool.` }],
        tools: [
          {
            name: tool.name,
            description: tool.description,
            input_schema: inputSchema as Anthropic.Tool.InputSchema,
            strict: true,
          },
        ],
        // Forced tool_choice (any/tool) is rejected by several current models,
        // so we ask for the tool in the prompt and verify the call below.
        tool_choice: { type: 'auto' },
      })
    } catch (error) {
      throw toAiError(error, logger)
    }

    record.run(gameId, userId, response.model, response.usage.input_tokens, response.usage.output_tokens)
    logger.info('ai call', { gameId, userId, model: response.model, output_tokens: response.usage.output_tokens })

    if (response.stop_reason === 'refusal') throw new AiError('refused', 'The model declined this request.')
    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === tool.name,
    )
    if (!call) {
      throw new AiError('invalid', response.stop_reason === 'max_tokens' ? 'The response was cut off.' : 'The model did not return any results.')
    }
    const parsed = tool.inputSchema.safeParse(call.input)
    if (!parsed.success) throw new AiError('invalid', `The model returned malformed results: ${z.prettifyError(parsed.error)}`)
    return parsed.data
  }

  return {
    forGame: (gameId) => ({ generate: (request) => generate(gameId, request) }),
    chat,
    usageToday() {
      const totals = db
        .prepare(
          `SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens
           FROM ai_usage WHERE created_at >= date('now')`,
        )
        .get() as { calls: number; inputTokens: number; outputTokens: number }
      const byGame = db
        .prepare(
          `SELECT game_id AS gameId, COUNT(*) AS calls, SUM(output_tokens) AS outputTokens
           FROM ai_usage WHERE created_at >= date('now') GROUP BY game_id ORDER BY game_id`,
        )
        .all() as unknown as AiUsageSummary['byGame']
      return { ...totals, cap: config.AI_DAILY_OUTPUT_TOKEN_CAP, byGame }
    },
  }
}

function toAiError(error: unknown, logger: Logger): AiError {
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError('rate_limited', 'The AI service is busy. Try again in a minute.')
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    logger.error('anthropic auth failed: check ANTHROPIC_API_KEY')
    return new AiError('api', 'The AI service is not configured correctly.')
  }
  if (error instanceof Anthropic.APIError) {
    logger.error('anthropic api error', { status: error.status, message: error.message })
    return new AiError('api', `The AI service returned an error (${error.status ?? 'network'}).`)
  }
  logger.error('ai call failed', { error: error instanceof Error ? error.message : String(error) })
  return new AiError('api', 'The AI service could not be reached.')
}
