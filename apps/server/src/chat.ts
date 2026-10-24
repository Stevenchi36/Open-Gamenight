/**
 * The admin Assistant: a chat where Claude manages the game libraries with the same
 * tools the MCP server exposes (`<gameId>_<tool>`, via gameMcpTools). Only reachable
 * through POST /api/admin/chat, behind the Origin check and requireAdmin.
 *
 * Conversations live in memory, one owner each, and are dropped after IDLE_MS (or on
 * restart). History is append-only: every assistant turn goes back exactly as received,
 * thinking blocks included.
 */
import { randomUUID } from 'node:crypto'
import type Anthropic from '@anthropic-ai/sdk'
import { gameMcpTools } from '@wsfg/core/categories'
import { AiError, type AnyGameModule, type Logger, type McpToolDef, type ServerServices } from '@wsfg/core/contract'
import { z } from 'zod'
import type { AiCore } from './ai.ts'
import type { Config } from './config.ts'
import { RateLimiter } from './middleware.ts'

/** What the client receives, one JSON object per line. */
export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; label: string; ok: boolean; error?: string }
  | { type: 'error'; message: string }
  | { type: 'done'; conversationId: string }

export interface ChatRefusal {
  status: number
  error: string
  message: string
}

export interface AdminChat {
  /** Checks limits and ownership; returns the turn to run, or why it can't. */
  start(userId: string, conversationId: string | null, text: string): ChatRefusal | { run(emit: (event: ChatEvent) => void): Promise<void> }
  /** Forget one of this admin's conversations (New chat). False if there's no such idle one. */
  end(userId: string, conversationId: string): boolean
}

export const CHAT_MESSAGE_MAX_LENGTH = 4000
/** Model calls per admin message: enough for list -> add -> check, not a runaway loop. */
const MAX_ROUNDS = 12
const MAX_TOKENS = 16_000
const MAX_RESULT_CHARS = 20_000
const MAX_HISTORY = 300
const IDLE_MS = 2 * 60 * 60_000
const MAX_CONVERSATIONS_PER_ADMIN = 5

interface ChatTool {
  def: McpToolDef
  label: string
}

interface Conversation {
  id: string
  userId: string
  messages: Anthropic.MessageParam[]
  lastUsed: number
  busy: boolean
}

function systemPrompt(appName: string, games: readonly AnyGameModule[], withTools: Set<string>): string {
  const list = games
    .map((g) => `- ${g.id}: ${g.name}. ${g.description}${withTools.has(g.id) ? '' : ' (nothing to manage)'}`)
    .join('\n')
  return `You are the admin assistant for ${appName}, a website of party games for families and friends. You are talking to a signed-in admin.
You manage the games' content libraries (categories, words, questions) with your tools. Each tool name starts with the id of the game it belongs to.

Games:
${list}

How to work:
- Do what the admin asks using the tools, then reply briefly with what changed (counts and categories). When you write new words or questions yourself, follow the rules in the tool descriptions.
- If it's unclear which game or category the admin means, ask before changing anything.
- Before removing or deleting anything, say exactly what you would remove and wait for the admin to confirm in their next message. Adding and editing need no confirmation.
- You can only do what the tools allow. Users, rooms and settings are managed on other admin pages; say so if asked.
- Replies are shown as plain text: no headings or tables; short "-" lists are fine.`
}

function resultText(value: unknown): string {
  const text = JSON.stringify(value) ?? 'null'
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}... (truncated; ask for less at a time)` : text
}

export function createAdminChat(deps: {
  ai: AiCore
  config: Pick<Config, 'APP_NAME' | 'ANTHROPIC_CHAT_MODEL' | 'AI_CHAT_MESSAGES_PER_HOUR'>
  games: readonly AnyGameModule[]
  servicesFor: (game: AnyGameModule) => ServerServices
  logger: Logger
}): AdminChat {
  const { ai, config, logger } = deps

  // ai: null leaves out the generate_* tools: Claude writes entries itself here.
  const tools = new Map<string, ChatTool>()
  for (const game of deps.games) {
    for (const def of gameMcpTools(game, { ...deps.servicesFor(game), ai: null })) {
      tools.set(`${game.id}_${def.name}`, { def, label: `${game.name}: ${def.name.replaceAll('_', ' ')}` })
    }
  }
  const withTools = new Set([...tools.keys()].map((name) => name.slice(0, name.indexOf('_'))))
  const apiTools: Anthropic.Tool[] = [...tools].map(([name, { def }]) => {
    const { $schema: _ignored, ...schema } = z.toJSONSchema(def.inputSchema) as Record<string, unknown>
    return { name, description: def.description, input_schema: schema as Anthropic.Tool.InputSchema }
  })
  const system = systemPrompt(config.APP_NAME, deps.games, withTools)

  const conversations = new Map<string, Conversation>()
  const perHour = new RateLimiter({ windowMs: 60 * 60_000, max: config.AI_CHAT_MESSAGES_PER_HOUR })

  function sweepIdle(now: number): void {
    for (const [id, c] of conversations) if (!c.busy && c.lastUsed < now - IDLE_MS) conversations.delete(id)
  }

  /** Make room for one more of this admin's conversations by dropping their oldest idle ones. */
  function makeRoom(userId: string): void {
    const mine = [...conversations.values()].filter((c) => c.userId === userId && !c.busy).sort((a, b) => a.lastUsed - b.lastUsed)
    for (const c of mine.slice(0, Math.max(0, mine.length - MAX_CONVERSATIONS_PER_ADMIN + 1))) conversations.delete(c.id)
  }

  async function runTool(block: Anthropic.ToolUseBlock, emit: (event: ChatEvent) => void): Promise<Anthropic.ToolResultBlockParam> {
    const tool = tools.get(block.name)
    const fail = (error: string): Anthropic.ToolResultBlockParam => {
      emit({ type: 'tool', name: block.name, label: tool?.label ?? block.name, ok: false, error })
      return { type: 'tool_result', tool_use_id: block.id, content: `Error: ${error}`, is_error: true }
    }
    if (!tool) return fail('No such tool')
    const parsed = tool.def.inputSchema.safeParse(block.input)
    if (!parsed.success) return fail(`Invalid input: ${z.prettifyError(parsed.error)}`)
    try {
      const result = await tool.def.handler(parsed.data)
      emit({ type: 'tool', name: block.name, label: tool.label, ok: true })
      return { type: 'tool_result', tool_use_id: block.id, content: resultText(result) }
    } catch (error) {
      logger.warn('chat tool failed', { tool: block.name, error: error instanceof Error ? error.message : String(error) })
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  async function run(conversation: Conversation, emit: (event: ChatEvent) => void): Promise<void> {
    const { messages, userId } = conversation
    try {
      for (let round = 0; ; round++) {
        if (round === MAX_ROUNDS) {
          emit({ type: 'error', message: `Stopped after ${MAX_ROUNDS} steps. Say "continue" to let it carry on.` })
          return
        }
        const response = await ai.chat(userId, {
          model: config.ANTHROPIC_CHAT_MODEL,
          max_tokens: MAX_TOKENS,
          system,
          tools: apiTools,
          messages: [...messages], // a snapshot: the history grows while the SDK may still retry this request
          output_config: { effort: 'medium' },
          // Tools and system prompt never change, so each call re-reads the conversation from cache.
          cache_control: { type: 'ephemeral' },
        })
        messages.push({ role: 'assistant', content: response.content })
        for (const block of response.content) {
          if (block.type === 'text' && block.text.trim()) emit({ type: 'text', text: block.text })
        }

        if (response.stop_reason === 'tool_use') {
          const results: Anthropic.ToolResultBlockParam[] = []
          // One at a time, in order: they share one SQLite connection and may depend on each other.
          for (const block of response.content) if (block.type === 'tool_use') results.push(await runTool(block, emit))
          messages.push({ role: 'user', content: results })
          continue
        }
        if (response.stop_reason === 'pause_turn') continue
        if (response.stop_reason === 'max_tokens') emit({ type: 'error', message: 'The reply was cut off. Ask for less at a time.' })
        if (response.stop_reason === 'refusal') emit({ type: 'error', message: 'Claude declined this request.' })
        return
      }
    } catch (error) {
      // A failed call leaves the history valid (it ends on a user turn), so the chat can go on.
      if (!(error instanceof AiError)) logger.error('chat failed', { error: error instanceof Error ? error.stack : String(error) })
      emit({ type: 'error', message: error instanceof AiError ? error.message : 'Something went wrong.' })
    }
  }

  return {
    end(userId, conversationId) {
      const conversation = conversations.get(conversationId)
      // A running turn still appends to it; the page only offers New chat when idle.
      if (!conversation || conversation.userId !== userId || conversation.busy) return false
      return conversations.delete(conversationId)
    },
    start(userId, conversationId, text) {
      const now = Date.now()
      sweepIdle(now)
      let conversation: Conversation | undefined
      if (conversationId) {
        conversation = conversations.get(conversationId)
        if (!conversation || conversation.userId !== userId) {
          return { status: 404, error: 'not_found', message: 'This chat has expired. Start a new one.' }
        }
        if (conversation.busy) return { status: 409, error: 'busy', message: 'Still working on your last message.' }
        if (conversation.messages.length >= MAX_HISTORY) {
          return { status: 409, error: 'too_long', message: 'This chat is very long. Start a new one.' }
        }
      }
      if (!perHour.consume(userId, now)) {
        return {
          status: 429,
          error: 'rate_limited',
          message: `You've sent ${config.AI_CHAT_MESSAGES_PER_HOUR} messages this hour. Try again later.`,
        }
      }
      if (!conversation) {
        makeRoom(userId)
        conversation = { id: randomUUID(), userId, messages: [], lastUsed: now, busy: false }
        conversations.set(conversation.id, conversation)
      }
      const chat = conversation
      chat.busy = true
      chat.messages.push({ role: 'user', content: text })
      return {
        async run(emit) {
          try {
            await run(chat, emit)
          } finally {
            chat.busy = false
            chat.lastUsed = Date.now()
            emit({ type: 'done', conversationId: chat.id })
          }
        },
      }
    },
  }
}
