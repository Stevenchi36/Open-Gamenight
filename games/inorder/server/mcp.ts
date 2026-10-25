/**
 * MCP tools for the theme library, registered as inorder_<name> by apps/mcp.
 * Driven from Claude Code/Desktop, Claude writes the themes itself, so adding
 * them needs no API key. inorder_generate_themes exists only when the AI
 * service does (ANTHROPIC_API_KEY set) and saves directly, within the daily cap.
 */
import { AI_INSTRUCTIONS_MAX_LENGTH, type McpToolDef, type ServerServices } from '@wsfg/core/contract'
import { CATEGORY_REUSE_RULE } from '@wsfg/core/categories'
import { BATCH_RULE, batchField } from '@wsfg/core/library'
import { z } from 'zod'
import { addThemes, generateThemes, listCategories, listThemes, LOW_STOCK_THRESHOLD, MAX_GENERATE, removeThemes, updateTheme } from './library.ts'

const themeInput = z.object({
  category: z.string().describe('Category, e.g. "Food & Drink". Reuse an existing category (see list_categories) when one means the same thing.'),
  theme: z
    .string()
    .describe('A scale everyone can picture, as a short question, e.g. "How scary is it?". Not something with an exact measurable answer. 5-80 characters.'),
  low: z.string().describe('What 1 means on the scale, a few words, e.g. "Not scary at all". At most 30 characters.'),
  high: z.string().describe('What 100 means, e.g. "Terrifying". At most 30 characters, different from low.'),
})

const addSchema = z.object({ themes: z.array(themeInput).min(1).max(200), batch: batchField })
const searchSchema = z.object({
  categoryId: z.number().int().optional().describe('Category id from list_categories (takes precedence over category)'),
  category: z.string().optional().describe('Category name, case-insensitive'),
  query: z.string().optional().describe('Substring match on the theme or either end of its scale'),
  limit: z.number().int().min(1).max(200).optional(),
})
const removeSchema = z.object({ ids: z.array(z.number().int()).min(1).max(500) })
const updateSchema = z.object({
  id: z.number().int().describe('Theme id (from search_themes)'),
  categoryId: z.number().int().optional().describe('Move to this category id (from list_categories)'),
  category: z
    .string()
    .optional()
    .describe('Or move to the category with this name, matched to an existing one where only the spelling differs, otherwise created; ignored when categoryId is given'),
  theme: z.string().optional().describe('New theme text'),
  low: z.string().optional().describe('New low end'),
  high: z.string().optional().describe('New high end'),
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
      name: 'add_themes',
      description:
        'Add themes to the In Order library. Each player gets a secret number from 1 to 100 and names something that fits the theme at that point ' +
        'on its scale ("How scary is it?": a kitten is low, a shark is high), then the team puts the answers in order. Good themes are scales ' +
        'everyone can picture, with many everyday things along them, where people roughly agree on the order but not exactly. ' +
        CATEGORY_REUSE_RULE +
        ' ' +
        'Duplicates (same category + theme, ignoring case, punctuation and plural "s") and invalid entries are skipped and reported. ' +
        BATCH_RULE,
      inputSchema: addSchema,
      handler: async (args) => {
        const { themes, batch } = addSchema.parse(args)
        return addThemes(services, themes, 'claude', batch)
      },
    },
    {
      name: 'list_categories',
      description: `List theme categories (including empty ones) with their ids, total and unused theme counts. Categories with fewer than ${LOW_STOCK_THRESHOLD} unused themes are running low. Manage them with inorder_create_category, inorder_rename_category and inorder_delete_category.`,
      inputSchema: z.object({}),
      handler: async () => listCategories(db).map((c) => ({ ...c, runningLow: c.unused < LOW_STOCK_THRESHOLD })),
    },
    {
      name: 'search_themes',
      description: 'Search the library by category (id or name) and/or a substring of the theme or its ends. Returns theme ids for update_theme and remove_themes.',
      inputSchema: searchSchema,
      handler: async (args) => {
        const { categoryId, category, query, limit } = searchSchema.parse(args)
        return listThemes(db, { categoryId: categoryId ?? null, category: category ?? null, q: query ?? null, limit: limit ?? 50 })
      },
    },
    {
      name: 'update_theme',
      description:
        'Edit one theme: move it to another category, or change its text or either end of the scale. Same rules as add_themes. ' +
        'Use it to empty a category before inorder_delete_category.',
      inputSchema: updateSchema,
      handler: async (args) => {
        const { id, categoryId, category, theme, low, high } = updateSchema.parse(args)
        const target = categoryId ?? (category ? categories.ensure(category).id : undefined)
        const result = updateTheme(services, id, {
          ...(theme !== undefined ? { theme } : {}),
          ...(low !== undefined ? { low } : {}),
          ...(high !== undefined ? { high } : {}),
          ...(target ? { categoryId: target } : {}),
        })
        if (!result.ok) throw new Error(result.error)
        return result.value
      },
    },
    {
      name: 'remove_themes',
      description: 'Remove themes from the library by id (ids come from search_themes).',
      inputSchema: removeSchema,
      handler: async (args) => ({ removed: removeThemes(db, removeSchema.parse(args).ids) }),
    },
  ]
  if (ai) {
    tools.push({
      name: 'generate_themes',
      description:
        'Generate themes with the server-side Claude API and save them directly (counts against the daily AI token cap). ' +
        'Usually unnecessary from Claude Code/Desktop: you can write themes yourself and call add_themes. ' +
        BATCH_RULE,
      inputSchema: generateSchema,
      handler: async (args) => {
        const { count, category, instructions, batch } = generateSchema.parse(args)
        const { candidates, skipped } = await generateThemes(ai, services, {
          count,
          category: category ?? null,
          instructions: instructions ?? null,
          userId: null,
        })
        const saved = addThemes(services, candidates, 'claude', batch)
        return { ...saved, skipped: [...skipped, ...saved.skipped] }
      },
    })
  }
  return tools
}
