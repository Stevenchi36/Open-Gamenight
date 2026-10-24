/**
 * MCP tools for the question library, registered as flock_<name> by apps/mcp.
 * Driven from Claude Code/Desktop, Claude writes the questions itself, so adding
 * them needs no API key. flock_generate_questions exists only when the AI
 * service does (ANTHROPIC_API_KEY set) and saves directly, within the daily cap.
 */
import { AI_INSTRUCTIONS_MAX_LENGTH, type McpToolDef, type ServerServices } from '@wsfg/core/contract'
import { CATEGORY_REUSE_RULE } from '@wsfg/core/categories'
import { BATCH_RULE, batchField } from '@wsfg/core/library'
import { z } from 'zod'
import {
  addQuestions,
  generateQuestions,
  listCategories,
  listQuestions,
  LOW_STOCK_THRESHOLD,
  MAX_GENERATE,
  removeQuestions,
  updateQuestion,
} from './library.ts'

const questionInput = z.object({
  category: z.string().describe('Category, e.g. "Food & Drink". Reuse an existing category (see list_categories) when one means the same thing.'),
  question: z
    .string()
    .describe(
      'A question with many possible answers but a few obvious favourites, answered in a word or short phrase, ' +
        'e.g. "Name a breakfast cereal". Not trivia with one right answer. 5-120 characters.',
    ),
})

const addSchema = z.object({ questions: z.array(questionInput).min(1).max(200), batch: batchField })
const searchSchema = z.object({
  categoryId: z.number().int().optional().describe('Category id from list_categories (takes precedence over category)'),
  category: z.string().optional().describe('Category name, case-insensitive'),
  query: z.string().optional().describe('Substring match on the question'),
  limit: z.number().int().min(1).max(200).optional(),
})
const removeSchema = z.object({ ids: z.array(z.number().int()).min(1).max(500) })
const updateSchema = z.object({
  id: z.number().int().describe('Question id (from search_questions)'),
  categoryId: z.number().int().optional().describe('Move to this category id (from list_categories)'),
  category: z
    .string()
    .optional()
    .describe('Or move to the category with this name, matched to an existing one where only the spelling differs, otherwise created; ignored when categoryId is given'),
  question: z.string().optional().describe('New question text'),
})
const generateSchema = z.object({
  count: z.number().int().min(1).max(MAX_GENERATE),
  category: z.string().optional().describe('One category for everything; reuse an existing one (see list_categories) when it fits. Omit it to let instructions name the categories, or for a mix.'),
  instructions: z
    .string()
    .max(AI_INSTRUCTIONS_MAX_LENGTH)
    .optional()
    .describe('Any other wishes from the user, passed to the generator as written, e.g. "really easy, for young kids"'),
  batch: batchField,
})

export function mcpTools(services: ServerServices): McpToolDef[] {
  const { db, ai, categories } = services
  const tools: McpToolDef[] = [
    {
      name: 'add_questions',
      description:
        'Add questions to the Flock library. Players all answer the same question and score by matching the most popular answer, ' +
        'so good questions have a few obvious answers most people reach for ("Name a breakfast cereal", "What is the best pizza topping?"), ' +
        'answered in a word or short phrase. Avoid trivia with one correct answer. ' +
        CATEGORY_REUSE_RULE +
        ' ' +
        'Duplicates (same category + question, ignoring case, punctuation and plural "s") and invalid entries are skipped and reported. ' +
        BATCH_RULE,
      inputSchema: addSchema,
      handler: async (args) => {
        const { questions, batch } = addSchema.parse(args)
        return addQuestions(services, questions, 'claude', batch)
      },
    },
    {
      name: 'list_categories',
      description: `List question categories (including empty ones) with their ids, total and unused question counts. Categories with fewer than ${LOW_STOCK_THRESHOLD} unused questions are running low. Manage them with flock_create_category, flock_rename_category and flock_delete_category.`,
      inputSchema: z.object({}),
      handler: async () => listCategories(db).map((c) => ({ ...c, runningLow: c.unused < LOW_STOCK_THRESHOLD })),
    },
    {
      name: 'search_questions',
      description: 'Search the library by category (id or name) and/or a substring of the question. Returns question ids for update_question and remove_questions.',
      inputSchema: searchSchema,
      handler: async (args) => {
        const { categoryId, category, query, limit } = searchSchema.parse(args)
        return listQuestions(db, { categoryId: categoryId ?? null, category: category ?? null, q: query ?? null, limit: limit ?? 50 })
      },
    },
    {
      name: 'update_question',
      description:
        'Edit one question: move it to another category or change its text. Same rules as add_questions. ' +
        'Use it to empty a category before flock_delete_category.',
      inputSchema: updateSchema,
      handler: async (args) => {
        const { id, categoryId, category, question } = updateSchema.parse(args)
        const target = categoryId ?? (category ? categories.ensure(category).id : undefined)
        const result = updateQuestion(services, id, { ...(question !== undefined ? { question } : {}), ...(target ? { categoryId: target } : {}) })
        if (!result.ok) throw new Error(result.error)
        return result.value
      },
    },
    {
      name: 'remove_questions',
      description: 'Remove questions from the library by id (ids come from search_questions).',
      inputSchema: removeSchema,
      handler: async (args) => ({ removed: removeQuestions(db, removeSchema.parse(args).ids) }),
    },
  ]
  if (ai) {
    tools.push({
      name: 'generate_questions',
      description:
        'Generate questions with the server-side Claude API and save them directly (counts against the daily AI token cap). ' +
        'Usually unnecessary from Claude Code/Desktop: you can write questions yourself and call add_questions. ' +
        BATCH_RULE,
      inputSchema: generateSchema,
      handler: async (args) => {
        const { count, category, instructions, batch } = generateSchema.parse(args)
        const { candidates, skipped } = await generateQuestions(ai, services, {
          count,
          category: category ?? null,
          instructions: instructions ?? null,
          userId: null,
        })
        const saved = addQuestions(services, candidates, 'claude', batch)
        return { ...saved, skipped: [...skipped, ...saved.skipped] }
      },
    })
  }
  return tools
}
