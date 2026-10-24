/**
 * MCP tools for the question library, registered as ballpark_<name> by apps/mcp.
 * Driven from Claude Code/Desktop, Claude writes the questions itself, so adding
 * them needs no API key. ballpark_generate_questions exists only when the AI
 * service does (ANTHROPIC_API_KEY set) and saves directly, within the daily cap.
 */
import { AI_INSTRUCTIONS_MAX_LENGTH, type McpToolDef, type ServerServices } from '@wsfg/core/contract'
import { CATEGORY_REUSE_RULE } from '@wsfg/core/categories'
import { z } from 'zod'
import {
  addQuestions,
  generateQuestions,
  listCategories,
  listQuestions,
  LOW_STOCK_THRESHOLD,
  MAX_GENERATE,
  removeQuestions,
  UNIT_GUIDE,
  updateQuestion,
} from './library.ts'

const questionInput = z.object({
  category: z.string().describe('Category, e.g. "Geography". Reuse an existing category (see list_categories) when one means the same thing.'),
  question: z
    .string()
    .describe(
      'A trivia question with one well-documented numeric answer that will not change soon, ending in "?", 5-160 characters. ' +
        'Never name the unit: the game shows it beside the question and converts it for imperial players ' +
        '(e.g. "How tall is the Eiffel Tower?", not "...in metres?").',
    ),
  answer: z.number().describe('The answer, in `unit`. Double-check it.'),
  unit: z
    .string()
    .nullable()
    .describe(`Unit code, metric for measurements: ${UNIT_GUIDE}. null for counts and calendar years.`),
  fact: z
    .string()
    .nullish()
    .describe('Optional note shown with the answer (where or when it was measured), up to 200 characters, no measurements in it.'),
})

// The person asking may be about to play, so the reply must not spoil the answers.
// The note rides on the tool result too, because that's what the model reads
// right before it answers.
const SECRET_REPLY_RULE =
  "Keep the answers secret in your reply: the person may be playing. Report only counts and category names; don't list the questions or answers unless they explicitly ask to see them."

const addSchema = z.object({ questions: z.array(questionInput).min(1).max(200) })
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
  answer: z.number().optional().describe('New answer, in the unit'),
  unit: z.string().nullable().optional().describe('New unit code, or null for none'),
  fact: z.string().nullable().optional().describe('New fact, or null to remove it'),
})
const generateSchema = z.object({
  count: z.number().int().min(1).max(MAX_GENERATE),
  category: z.string().optional().describe('One category for everything; reuse an existing one (see list_categories) when it fits. Omit it to let instructions name the categories, or for a mix.'),
  instructions: z
    .string()
    .max(AI_INSTRUCTIONS_MAX_LENGTH)
    .optional()
    .describe('Any other wishes from the user, passed to the generator as written, e.g. "really easy, for young kids"'),
})

export function mcpTools(services: ServerServices): McpToolDef[] {
  const { db, ai, categories } = services
  const tools: McpToolDef[] = [
    {
      name: 'add_questions',
      description:
        'Add questions to the Ballpark library. Players each guess a number for the question, then bet on whose guess is closest, ' +
        'so good questions have one well-documented numeric answer that a sensible guess can land near. ' +
        'Avoid populations, prices and records likely to change. ' +
        CATEGORY_REUSE_RULE +
        ' ' +
        'Duplicates (same category + question, ignoring case, punctuation and plural "s") and invalid entries are skipped and reported. ' +
        SECRET_REPLY_RULE,
      inputSchema: addSchema,
      handler: async (args) => ({ ...addQuestions(services, addSchema.parse(args).questions, 'claude'), note: SECRET_REPLY_RULE }),
    },
    {
      name: 'list_categories',
      description: `List question categories (including empty ones) with their ids, total and unused question counts. Categories with fewer than ${LOW_STOCK_THRESHOLD} unused questions are running low. Manage them with ballpark_create_category, ballpark_rename_category and ballpark_delete_category.`,
      inputSchema: z.object({}),
      handler: async () => listCategories(db).map((c) => ({ ...c, runningLow: c.unused < LOW_STOCK_THRESHOLD })),
    },
    {
      name: 'search_questions',
      description:
        'Search the library by category (id or name) and/or a substring of the question. Returns question ids for update_question and remove_questions. ' +
        'Results include answers: only show them if the person asked.',
      inputSchema: searchSchema,
      handler: async (args) => {
        const { categoryId, category, query, limit } = searchSchema.parse(args)
        return listQuestions(db, { categoryId: categoryId ?? null, category: category ?? null, q: query ?? null, limit: limit ?? 50 })
      },
    },
    {
      name: 'update_question',
      description:
        'Edit one question: move it to another category, or change its text, answer, unit or fact. Same rules as add_questions. ' +
        'Use it to empty a category before ballpark_delete_category.',
      inputSchema: updateSchema,
      handler: async (args) => {
        const { id, categoryId, category, ...fields } = updateSchema.parse(args)
        const target = categoryId ?? (category ? categories.ensure(category).id : undefined)
        const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
        const result = updateQuestion(services, id, { ...patch, ...(target ? { categoryId: target } : {}) })
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
        SECRET_REPLY_RULE,
      inputSchema: generateSchema,
      handler: async (args) => {
        const { count, category, instructions } = generateSchema.parse(args)
        const { candidates, skipped } = await generateQuestions(ai, services, {
          count,
          category: category ?? null,
          instructions: instructions ?? null,
          userId: null,
        })
        const saved = addQuestions(services, candidates, 'claude')
        return { ...saved, skipped: [...skipped, ...saved.skipped], note: SECRET_REPLY_RULE }
      },
    })
  }
  return tools
}
