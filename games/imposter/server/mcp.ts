/**
 * MCP tools for the word library, registered as imposter_<name> by apps/mcp.
 * Driven from Claude Code/Desktop, Claude writes the words itself, so adding
 * words needs no API key. imposter_generate_words exists only when the AI
 * service does (ANTHROPIC_API_KEY set) and saves directly, within the daily cap.
 */
import type { McpToolDef, ServerServices } from '@wsfg/core/contract'
import { z } from 'zod'
import { addWords, generateWords, listCategories, listWords, LOW_STOCK_THRESHOLD, MAX_GENERATE, removeWords } from './library.ts'

const wordInput = z.object({
  category: z.string().describe('Category, e.g. "Animals". Reuse existing category names where they fit.'),
  word: z.string().describe('The secret word: concrete, widely known, 1-3 words, under 30 characters.'),
  hint: z
    .string()
    .describe('A vague hint for the imposter: enough to bluff with, must not contain or give away the word.'),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
})

const addSchema = z.object({ words: z.array(wordInput).min(1).max(200) })
const searchSchema = z.object({
  category: z.string().optional(),
  query: z.string().optional().describe('Substring match on word or hint'),
  limit: z.number().int().min(1).max(200).optional(),
})
const removeSchema = z.object({ ids: z.array(z.number().int()).min(1).max(500) })
const generateSchema = z.object({
  count: z.number().int().min(1).max(MAX_GENERATE),
  category: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
})

export function mcpTools(services: ServerServices): McpToolDef[] {
  const { db, ai } = services
  const tools: McpToolDef[] = [
    {
      name: 'add_words',
      description:
        'Add words to the Word Imposter library. Each needs a category, the word, and a vague hint for the imposter. ' +
        'Duplicates (same category + word) and invalid entries are skipped and reported.',
      inputSchema: addSchema,
      handler: async (args) => addWords(db, addSchema.parse(args).words, 'claude'),
    },
    {
      name: 'list_categories',
      description: `List library categories with total and unused word counts. Categories with fewer than ${LOW_STOCK_THRESHOLD} unused words are running low.`,
      inputSchema: z.object({}),
      handler: async () =>
        listCategories(db).map((c) => ({ ...c, runningLow: c.unused < LOW_STOCK_THRESHOLD })),
    },
    {
      name: 'search_words',
      description: 'Search the library by category and/or a substring of the word or hint.',
      inputSchema: searchSchema,
      handler: async (args) => {
        const { category, query, limit } = searchSchema.parse(args)
        return listWords(db, { category: category ?? null, q: query ?? null, limit: limit ?? 50 })
      },
    },
    {
      name: 'remove_words',
      description: 'Remove words from the library by id (ids come from search_words).',
      inputSchema: removeSchema,
      handler: async (args) => ({ removed: removeWords(db, removeSchema.parse(args).ids) }),
    },
  ]
  if (ai) {
    tools.push({
      name: 'generate_words',
      description:
        'Generate words with the server-side Claude API and save them directly (counts against the daily AI token cap). ' +
        'Usually unnecessary from Claude Code/Desktop: you can write words yourself and call add_words.',
      inputSchema: generateSchema,
      handler: async (args) => {
        const { count, category, difficulty } = generateSchema.parse(args)
        const { candidates, skipped } = await generateWords(ai, db, {
          count,
          category: category ?? null,
          difficulty: difficulty ?? null,
          userId: null,
        })
        const saved = addWords(db, candidates, 'claude')
        return { inserted: saved.inserted, skipped: [...skipped, ...saved.skipped] }
      },
    })
  }
  return tools
}
