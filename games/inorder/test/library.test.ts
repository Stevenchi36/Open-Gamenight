import { DatabaseSync } from 'node:sqlite'
import { CATEGORIES_MIGRATION, createCategoryService } from '@ogn/core/categories'
import { AiError, type ServerServices } from '@ogn/core/contract'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_THEME_LIST, DEFAULT_THEMES } from '../server/default-themes.ts'
import { inOrder } from '../server/index.ts'
import {
  addThemes,
  categoryUsage,
  generateThemes,
  listCategories,
  listThemes,
  pickTheme,
  playableCategories,
  removeThemes,
  screenCandidates,
  updateTheme,
} from '../server/library.ts'
import { migrations } from '../server/migrations.ts'
import { mcpTools } from '../server/mcp.ts'
import { defaultSettings, type InOrderSettings } from '../shared/index.ts'

let db: DatabaseSync
let services: ServerServices

const SEED_ID = '002_default_themes'

/** Same order as the server: core tables first, then the game's migrations. Empty library unless `seed`. */
function freshDb({ seed = false } = {}) {
  const d = new DatabaseSync(':memory:')
  d.exec('PRAGMA foreign_keys = ON')
  d.exec(CATEGORIES_MIGRATION.sql)
  for (const m of migrations) if (seed || m.id !== SEED_ID) d.exec(m.sql)
  return d
}

function useDb(d: DatabaseSync) {
  db = d
  services = {
    gameId: 'inorder',
    db,
    ai: null,
    logger: { info() {}, warn() {}, error() {} },
    categories: createCategoryService(db, 'inorder'),
  }
}

beforeEach(() => useDb(freshDb()))

const themes = [
  { category: 'Life', theme: 'How scary is it?', low: 'Not scary', high: 'Terrifying' },
  { category: 'Life', theme: 'How loud is it?', low: 'Silent', high: 'Deafening' },
  { category: 'Food', theme: 'How spicy is it?', low: 'Mild', high: 'Mouth on fire' },
]
const idOf = (name: string) => services.categories.findByName(name)!.id

describe('migration 002: default themes', () => {
  it('seeds every starter theme as builtin, in its own categories', () => {
    useDb(freshDb({ seed: true }))
    expect(listThemes(db, { limit: 200 }).total).toBe(DEFAULT_THEME_LIST.length)
    expect(listCategories(db).map((c) => c.category).sort()).toEqual(Object.keys(DEFAULT_THEMES).sort())
    expect(db.prepare('SELECT DISTINCT source FROM inorder_themes').all()).toEqual([{ source: 'builtin' }])
    const scary = listThemes(db, { q: 'How scary' }).themes[0]!
    expect(scary).toMatchObject({ low: 'Not scary at all', high: 'Terrifying' })
  })

  it('keeps an existing library and only adds what is missing', () => {
    addThemes(services, [{ category: 'everyday life', theme: 'How wobbly is it?', low: 'Solid', high: 'Jelly' }])
    db.exec(migrations.find((m) => m.id === SEED_ID)!.sql)
    expect(listCategories(db).filter((c) => c.category.toLowerCase() === 'everyday life')).toHaveLength(1)
    expect(listThemes(db, { limit: 200 }).total).toBe(DEFAULT_THEME_LIST.length + 1)
  })

  it('every starter theme passes validation', () => {
    expect(addThemes(services, DEFAULT_THEME_LIST).skipped).toEqual([])
  })

  it('leaves the categories of other games alone', () => {
    db.exec("INSERT INTO categories (game_id, name) VALUES ('flock', 'Food & Drink')")
    db.exec(migrations.find((m) => m.id === SEED_ID)!.sql)
    expect(db.prepare("SELECT game_id FROM categories WHERE name = 'Food & Drink' ORDER BY game_id").all()).toEqual([
      { game_id: 'flock' },
      { game_id: 'inorder' },
    ])
  })
})

describe('addThemes', () => {
  it('inserts, creating categories, and skips duplicates and invalid entries', () => {
    const result = addThemes(services, [
      ...themes,
      { category: 'life', theme: 'how SCARY is it', low: 'a', high: 'b' },
      { category: 'Life', theme: 'How tall?', low: 'Short', high: 'short' },
    ])
    expect(result).toMatchObject({
      inserted: 3,
      createdCategories: ['Life', 'Food'],
      insertedByCategory: { Life: 2, Food: 1 },
      skipped: [
        { theme: 'how SCARY is it', reason: 'Already in the library as How scary is it?' },
        { theme: 'How tall?', reason: 'The two ends must be different' },
      ],
    })
  })

  it('screens generated themes the same way', () => {
    addThemes(services, themes)
    expect(screenCandidates(services, [{ category: 'life', theme: 'How scary are they?', low: 'a', high: 'b' }], null).candidates).toHaveLength(1)
    expect(screenCandidates(services, [{ category: 'life', theme: 'How loud is it!', low: 'a', high: 'b' }], null).skipped).toEqual([
      { theme: 'How loud is it!', category: 'Life', reason: 'Already in the library as How loud is it?' },
    ])
  })
})

describe('listing, editing and removing', () => {
  beforeEach(() => void addThemes(services, themes))

  it('lists and filters by category and text, searching the ends too', () => {
    expect(listThemes(db).total).toBe(3)
    expect(listThemes(db, { category: 'life' }).themes.map((t) => t.theme)).toEqual(['How loud is it?', 'How scary is it?'])
    expect(listThemes(db, { categoryId: idOf('Food') }).total).toBe(1)
    expect(listThemes(db, { q: 'DEAFEN' }).themes[0]!.theme).toBe('How loud is it?')
    expect(listThemes(db, { q: '%' }).total).toBe(0)
  })

  it('lists categories with counts, including empty ones', () => {
    services.categories.create('Empty')
    expect(listCategories(db)).toEqual([
      { id: idOf('Empty'), category: 'Empty', total: 0, unused: 0 },
      { id: idOf('Food'), category: 'Food', total: 1, unused: 1 },
      { id: idOf('Life'), category: 'Life', total: 2, unused: 2 },
    ])
    expect(playableCategories(db)).toEqual([
      { category: 'Food', total: 1 },
      { category: 'Life', total: 2 },
    ])
    expect(categoryUsage(db)).toEqual({ [idOf('Food')]: 1, [idOf('Life')]: 2 })
  })

  it('edits and moves a theme, refusing clashes and bad ends', () => {
    const spicy = listThemes(db, { q: 'spicy' }).themes[0]!
    expect(updateTheme(services, spicy.id, { categoryId: idOf('Life'), high: 'Volcano' })).toMatchObject({
      ok: true,
      value: { category: 'Life', theme: 'How spicy is it?', low: 'Mild', high: 'Volcano' },
    })
    expect(updateTheme(services, spicy.id, { theme: 'How scary is it' })).toEqual({ ok: false, error: 'That theme is already in Life' })
    expect(updateTheme(services, spicy.id, { low: 'volcano' })).toEqual({ ok: false, error: 'The two ends must be different' })
    expect(updateTheme(services, 999, { theme: 'How odd is it?' })).toEqual({ ok: false, error: 'No such theme' })
  })

  it('removes by id, and a category with themes cannot be deleted', () => {
    const ids = listThemes(db, { category: 'Life' }).themes.map((t) => t.id)
    expect(() => services.categories.remove(idOf('Life'))).toThrow(/still has/)
    expect(removeThemes(db, ids)).toBe(2)
    services.categories.remove(idOf('Life'))
    expect(listThemes(db).total).toBe(1)
  })
})

describe('pickTheme', () => {
  beforeEach(() => void addThemes(services, themes))

  it('picks the least used, marks it used, and honours category and exclusions', () => {
    const first = pickTheme(db, { category: 'Life' })!
    expect(first.category).toBe('Life')
    const second = pickTheme(db, { category: 'Life' })!
    expect(second.id).not.toBe(first.id)
    expect(pickTheme(db, { category: 'Life', excludeIds: [first.id, second.id] })).toBeNull()
    expect(listCategories(db).find((c) => c.category === 'Life')!.unused).toBe(0)
  })
})

describe('prepareRound', () => {
  const players = [{ id: 'p1', name: 'A', connected: true, isLoggedIn: true }]
  const prepare = (settings: Partial<InOrderSettings>, request: Parameters<NonNullable<typeof inOrder.prepareRound>>[0]) =>
    inOrder.prepareRound!(request, { settings: { ...defaultSettings, ...settings }, players, services })
  const state = (usedThemeIds: number[]) => ({ usedThemeIds }) as never

  it('returns nothing for actions that do not start a round', async () => {
    addThemes(services, themes)
    const request = { trigger: 'action', state: state([]), action: { type: 'set_ready', ready: true }, actorId: 'p1' } as const
    expect(await prepare({}, request)).toBeUndefined()
  })

  it('picks a library theme with its ends, excluding ones used in this room', async () => {
    addThemes(services, themes)
    const a = (await prepare({ category: 'Life' }, { trigger: 'init' })) as { id: number; text: string }
    expect(a).toMatchObject({ category: 'Life', low: expect.any(String), high: expect.any(String) })
    for (const type of ['next_round', 'new_game'] as const) {
      const b = await prepare({ category: 'Life' }, { trigger: 'action', state: state([a.id]), action: { type }, actorId: 'p1' })
      expect((b as { text: string }).text).not.toBe(a.text)
    }
  })

  it('"Recently added" plays the newest batch first, then older themes with a notice', async () => {
    const [scary, loud, spicy] = themes
    const first = addThemes(services, [scary!])
    addThemes(services, [loud!], 'claude', first.batch)
    addThemes(services, [spicy!])
    const a = (await prepare({ themeSource: 'recent' }, { trigger: 'init' })) as { id: number; text: string; notice?: string }
    expect(a.text).toBe(spicy!.theme)
    expect(a).not.toHaveProperty('notice')
    const b = await prepare({ themeSource: 'recent' }, { trigger: 'action', state: state([a.id]), action: { type: 'next_round' }, actorId: 'p1' })
    expect(b).toMatchObject({ category: 'Life', notice: 'The newest added themes have all been played, so older ones are used.' })
  })

  it('falls back to starter themes with a notice', async () => {
    expect(await prepare({}, { trigger: 'init' })).toEqual({ builtin: true, notice: 'The theme library is empty, so starter themes are used.' })
    addThemes(services, themes)
    expect(await prepare({ category: 'Toys' }, { trigger: 'init' })).toEqual({
      builtin: true,
      notice: 'No unused themes in Toys, so starter themes are used.',
    })
  })
})

describe('MCP tools', () => {
  const tool = (name: string) => mcpTools(services).find((t) => t.name === name)!

  it('has no generate tool without the AI service', () => {
    expect(mcpTools(services).map((t) => t.name)).toEqual(['add_themes', 'list_categories', 'search_themes', 'update_theme', 'remove_themes'])
  })

  it('adds, searches, edits, moves and removes themes', async () => {
    expect(await tool('add_themes').handler({ themes })).toMatchObject({ inserted: 3 })
    const found = (await tool('search_themes').handler({ query: 'spicy' })) as { themes: { id: number }[] }
    const id = found.themes[0]!.id
    expect(await tool('update_theme').handler({ id, category: 'Hot Things', low: 'Cool' })).toMatchObject({ category: 'Hot Things', low: 'Cool' })
    expect(await tool('list_categories').handler({})).toContainEqual(expect.objectContaining({ category: 'Hot Things', runningLow: true }))
    expect(await tool('remove_themes').handler({ ids: [id] })).toEqual({ removed: 1 })
    await expect(tool('update_theme').handler({ id, theme: 'How hot is it?' })).rejects.toThrow('No such theme')
  })
})

describe('generateThemes', () => {
  const entry = (theme: string, category = 'Space') => ({ category, theme, low: 'Not at all', high: 'Completely' })
  const fakeAi = (...replies: (unknown | Error)[]) => {
    const calls: unknown[] = []
    return {
      calls,
      ai: {
        async generate(request: unknown) {
          calls.push(request)
          const next = replies.shift()
          if (next instanceof Error) throw next
          return next as never
        },
      },
    }
  }

  it('returns screened candidates, capped to the requested count, using the stored category spelling', async () => {
    addThemes(services, [entry('How far away is it?')])
    const { ai, calls } = fakeAi({
      themes: [entry('How far away is it?'), entry('How bright is it?'), entry('how BRIGHT is it'), entry('How hot is it?'), entry('How old is it?')],
    })
    const result = await generateThemes(ai, services, { count: 2, category: 'space', instructions: 'Really easy, for young kids', userId: 'a1' })
    expect(result.candidates).toEqual([entry('How bright is it?'), entry('How hot is it?')])
    expect(result.skipped.map((s) => s.theme)).toEqual(['How far away is it?', 'how BRIGHT is it'])
    expect(JSON.stringify(calls[0])).toContain('How far away is it?') // avoid-list in the prompt
    expect(JSON.stringify(calls[0])).toContain('Really easy, for young kids')
    expect(listThemes(db).total).toBe(1) // nothing saved
  })

  it('retries once on an invalid response, then errors; cap errors are final', async () => {
    const ok = fakeAi(new AiError('invalid', 'bad'), { themes: [entry('How hot is it?')] })
    expect((await generateThemes(ok.ai, services, { count: 1, userId: null })).candidates).toHaveLength(1)
    expect(ok.calls).toHaveLength(2)

    const bad = fakeAi({ themes: [entry('Hm?')] }, { themes: [] })
    await expect(generateThemes(bad.ai, services, { count: 1, userId: null })).rejects.toMatchObject({ code: 'invalid' })
    expect(bad.calls).toHaveLength(2)

    const capped = fakeAi(new AiError('cap', 'budget'))
    await expect(generateThemes(capped.ai, services, { count: 5, userId: null })).rejects.toMatchObject({ code: 'cap' })
    expect(capped.calls).toHaveLength(1)
  })

  it('the MCP generate tool saves what it generates', async () => {
    const { ai } = fakeAi({ themes: [entry('How hot is it?'), entry('How old is it?')] })
    const generate = mcpTools({ ...services, ai }).find((t) => t.name === 'generate_themes')!
    expect(await generate.handler({ count: 2, category: 'Space' })).toMatchObject({ inserted: 2, createdCategories: ['Space'] })
    expect(listThemes(db, { category: 'Space' }).total).toBe(2)
  })
})
