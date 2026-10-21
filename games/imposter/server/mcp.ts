/**
 * MCP tools for the word library, registered as imposter_<name> by apps/mcp.
 * Driven from Claude Code/Desktop, Claude writes the words itself, so adding
 * words needs no API key. Generation (needs the key) arrives with the AI service.
 */
import type { McpToolDef, ServerServices } from '@wsfg/core/contract'
import { z } from 'zod'
import { addWords, listCategories, listWords, LOW_STOCK_THRESHOLD, removeWords } from './library.ts'

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

export function mcpTools(services: ServerServices): McpToolDef[] {
  const { db } = services
  return [
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
}
