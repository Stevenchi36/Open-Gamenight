/**
 * MCP tools for the word library, registered as imposter_<name> by apps/mcp.
 * Driven from Claude Code/Desktop, Claude writes the words itself, so adding
 * words needs no API key. imposter_generate_words exists only when the AI
 * service does (ANTHROPIC_API_KEY set) and saves directly, within the daily cap.
 */
import type { McpToolDef, ServerServices } from '@wsfg/core/contract'
import { z } from 'zod'
import {
  addWords,
  generateWords,
  listCategories,
  listWords,
  LOW_STOCK_THRESHOLD,
  MAX_GENERATE,
  removeWords,
  updateWord,
} from './library.ts'

const wordInput = z.object({
  category: z.string().describe('Category, e.g. "Animals". Reuse existing category names where they fit.'),
  word: z.string().describe('The secret word: concrete, widely known, 1-3 words, under 30 characters.'),
  hint: z
    .string()
    .describe(
      'A vague hint for the imposter. By default a single loosely related word (e.g. "Splash" for Water Gun, not "Squirt your friends"), ' +
        'unless the user asked for a different hint style. Must not contain or give away the word.',
    ),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
})

// The person asking may be about to play, so the reply must not spoil the words.
// The note rides on the tool result too, because that's what the model reads
// right before it answers.
const SECRET_REPLY_RULE =
  "Keep the words secret in your reply: the person may be playing. Report only counts and category names; don't list the words or hints unless they explicitly ask to see them."

const addSchema =z.object({ words: z.array(wordInput).min(1).max(200) })
const searchSchema = z.object({
  categoryId: z.number().int().optional().describe('Category id from list_categories (takes precedence over category)'),
  category: z.string().optional().describe('Category name, case-insensitive'),
  query: z.string().optional().describe('Substring match on word or hint'),
  limit: z.number().int().min(1).max(200).optional(),
})
const removeSchema = z.object({ ids: z.array(z.number().int()).min(1).max(500) })
const updateSchema = z.object({
  id: z.number().int().describe('Word id (from search_words)'),
  categoryId: z.number().int().optional().describe('Move to this category id (from list_categories)'),
  category: z
    .string()
    .optional()
    .describe('Or move to the category with this name (created if it does not exist); ignored when categoryId is given'),
  word: z.string().optional(),
  hint: z.string().optional().describe('One vague word by default, unless the user asks otherwise. Must not contain the word'),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
})
const generateSchema = z.object({
  count: z.number().int().min(1).max(MAX_GENERATE),
  category: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  hintStyle: z
    .string()
    .max(200)
    .optional()
    .describe('Only when the user asks for something other than one-word hints, e.g. "short phrases"'),
})

export function mcpTools(services: ServerServices): McpToolDef[] {
  const { db, ai, categories } = services
  const tools: McpToolDef[] = [
    {
      name: 'add_words',
      description:
        'Add words to the Word Imposter library. Each needs a category name, the word, and a vague hint for the imposter: ' +
        'one loosely related word by default (the imposter must be able to bluff, not deduce the word), unless the user asks for longer or more specific hints. ' +
        'Categories that do not exist yet are created (reported in createdCategories); prefer existing names from list_categories. ' +
        'Duplicates (same category + word) and invalid entries are skipped and reported. ' +
        SECRET_REPLY_RULE,
      inputSchema: addSchema,
      handler: async (args) => ({ ...addWords(services, addSchema.parse(args).words, 'claude'), note: SECRET_REPLY_RULE }),
    },
    {
      name: 'list_categories',
      description: `List library categories (including empty ones) with their ids, total and unused word counts. Categories with fewer than ${LOW_STOCK_THRESHOLD} unused words are running low. Manage them with imposter_create_category, imposter_rename_category and imposter_delete_category.`,
      inputSchema: z.object({}),
      handler: async () =>
        listCategories(db).map((c) => ({ ...c, runningLow: c.unused < LOW_STOCK_THRESHOLD })),
    },
    {
      name: 'search_words',
      description: 'Search the library by category (id or name) and/or a substring of the word or hint. Returns word ids for update_word and remove_words.',
      inputSchema: searchSchema,
      handler: async (args) => {
        const { categoryId, category, query, limit } = searchSchema.parse(args)
        return listWords(db, { categoryId: categoryId ?? null, category: category ?? null, q: query ?? null, limit: limit ?? 50 })
      },
    },
    {
      name: 'update_word',
      description:
        'Edit one word: move it to another category, or change its word, hint or difficulty. Same rules as add_words. ' +
        'Use it to empty a category before imposter_delete_category.',
      inputSchema: updateSchema,
      handler: async (args) => {
        const { id, categoryId, category, ...patch } = updateSchema.parse(args)
        const target = categoryId ?? (category ? categories.ensure(category).id : undefined)
        const result = updateWord(services, id, { ...patch, ...(target ? { categoryId: target } : {}) })
        if (!result.ok) throw new Error(result.error)
        return result.value
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
        'Usually unnecessary from Claude Code/Desktop: you can write words yourself and call add_words. ' +
        SECRET_REPLY_RULE,
      inputSchema: generateSchema,
      handler: async (args) => {
        const { count, category, difficulty, hintStyle } = generateSchema.parse(args)
        const { candidates, skipped } = await generateWords(ai, services, {
          count,
          category: category ?? null,
          difficulty: difficulty ?? null,
          hintStyle: hintStyle ?? null,
          userId: null,
        })
        const saved = addWords(services, candidates, 'claude')
        return { ...saved, skipped: [...skipped, ...saved.skipped], note: SECRET_REPLY_RULE }
      },
    })
  }
  return tools
}
