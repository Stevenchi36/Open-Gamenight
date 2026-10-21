/** A fake Anthropic messages client: records requests, replies with scripted tool calls. */
import Anthropic from '@anthropic-ai/sdk'
import type { MessagesClient } from '../../src/ai.ts'

type Reply = { input?: unknown; stopReason?: Anthropic.StopReason; noTool?: boolean; outputTokens?: number } | Error

export class FakeAnthropic implements MessagesClient {
  readonly requests: Anthropic.MessageCreateParamsNonStreaming[] = []
  private readonly replies: Reply[] = []

  reply(...replies: Reply[]): this {
    this.replies.push(...replies)
    return this
  }

  readonly messages = {
    create: async (params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> => {
      this.requests.push(params)
      const next = this.replies.shift() ?? { input: { words: [] } }
      if (next instanceof Error) throw next
      const toolName = params.tools?.[0] && 'name' in params.tools[0] ? params.tools[0].name : 'tool'
      const content = next.noTool
        ? [{ type: 'text', text: 'Here are some words!', citations: null }]
        : [{ type: 'tool_use', id: 'toolu_1', name: toolName, input: next.input ?? {}, caller: { type: 'direct' } }]
      return {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: params.model,
        content,
        stop_reason: next.stopReason ?? (next.noTool ? 'end_turn' : 'tool_use'),
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: next.outputTokens ?? 500 },
      } as unknown as Anthropic.Message
    },
  }
}
