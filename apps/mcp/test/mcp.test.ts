/**
 * Drives the real MCP process over stdio. If anything wrote to stdout besides
 * the protocol, the client would fail to parse it and these tests would fail.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { games } from '@ogn/games/server'
import { migrateGamesDb, openDatabase } from '@ogn/server/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let dir: string
let dbPath: string
let client: Client

const text = (result: { content: unknown }) => {
  const [first] = result.content as { type: string; text: string }[]
  return JSON.parse(first!.text) as unknown
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ogn-mcp-'))
  dbPath = join(dir, 'games.db')
  // Migrate up front and drop the seeded default words, so the tests start from an empty library.
  const db = openDatabase(dbPath)
  migrateGamesDb(db, games)
  db.exec("DELETE FROM imposter_words; DELETE FROM categories WHERE game_id = 'imposter'")
  db.close()
  client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(import.meta.dirname, '..', 'src', 'server.ts')],
      // empty key: the repo .env never overrides it, so generate_words stays unregistered here
      env: { GAMES_DB_PATH: dbPath, ANTHROPIC_API_KEY: '', PATH: process.env.PATH ?? '' },
      stderr: 'pipe',
    }),
  )
}, 20_000)

afterAll(async () => {
  await client?.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('MCP server', () => {
  it('registers namespaced game tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'ballpark_add_questions',
      'ballpark_create_category',
      'ballpark_delete_category',
      'ballpark_list_categories',
      'ballpark_remove_questions',
      'ballpark_rename_category',
      'ballpark_search_questions',
      'ballpark_update_question',
      'flock_add_questions',
      'flock_create_category',
      'flock_delete_category',
      'flock_list_categories',
      'flock_remove_questions',
      'flock_rename_category',
      'flock_search_questions',
      'flock_update_question',
      'imposter_add_words',
      'imposter_create_category',
      'imposter_delete_category',
      'imposter_list_categories',
      'imposter_remove_words',
      'imposter_rename_category',
      'imposter_search_words',
      'imposter_update_word',
      'inorder_add_themes',
      'inorder_create_category',
      'inorder_delete_category',
      'inorder_list_categories',
      'inorder_remove_themes',
      'inorder_rename_category',
      'inorder_search_themes',
      'inorder_update_theme',
    ])
  })

  it('adds 20 words, reports skips, and the words land in games.db', async () => {
    const animals = ['Otter', 'Moose', 'Koala', 'Lemur', 'Walrus', 'Badger', 'Falcon', 'Gecko', 'Panda', 'Raccoon']
    const foods = ['Bagel', 'Waffle', 'Noodles', 'Burrito', 'Muffin', 'Omelette', 'Risotto', 'Pancake', 'Dumpling', 'Nachos']
    const words = [
      ...animals.map((word) => ({ category: 'Animals', word, hint: 'Found in a nature documentary' })),
      ...foods.map((word) => ({ category: 'Food', word, hint: 'Something you might order' })),
      { category: 'Food', word: 'otter', hint: 'Not really food' }, // fine: different category
      { category: 'Animals', word: 'OTTER', hint: 'Duplicate' },
      { category: 'Animals', word: 'Seal', hint: 'A seal pup' },
    ]
    const result = await client.callTool({ name: 'imposter_add_words', arguments: { words } })
    expect(result.isError).toBeFalsy()
    expect(text(result)).toMatchObject({
      inserted: 21,
      createdCategories: ['Animals', 'Food'],
      skipped: [
        { word: 'OTTER', reason: 'Already in the library' },
        { word: 'Seal', reason: 'Hint must not contain the word' },
      ],
      note: expect.stringContaining("don't list the words"),
    })

    const db = new DatabaseSync(dbPath, { readOnly: true })
    expect(db.prepare('SELECT COUNT(*) AS n FROM imposter_words').get()).toEqual({ n: 21 })
    expect(db.prepare("SELECT DISTINCT source FROM imposter_words").all()).toEqual([{ source: 'claude' }])
    db.close()
  })

  it('lists categories with low-stock flags, searches and removes', async () => {
    const categories = text(await client.callTool({ name: 'imposter_list_categories', arguments: {} }))
    expect(categories).toEqual([
      { id: expect.any(Number), category: 'Animals', total: 10, unused: 10, runningLow: false },
      { id: expect.any(Number), category: 'Food', total: 11, unused: 11, runningLow: false },
    ])
    const found = text(await client.callTool({ name: 'imposter_search_words', arguments: { query: 'otter' } })) as {
      total: number
      words: { id: number }[]
    }
    expect(found.total).toBe(2)
    const removed = text(
      await client.callTool({ name: 'imposter_remove_words', arguments: { ids: found.words.map((w) => w.id) } }),
    )
    expect(removed).toEqual({ removed: 2 })
  })

  it('rejects invalid arguments without crashing', async () => {
    const result = await client.callTool({ name: 'imposter_remove_words', arguments: { ids: 'all' } }).catch((e) => e)
    expect(result instanceof Error || (result as { isError?: boolean }).isError).toBeTruthy()
    const { tools } = await client.listTools()
    expect(tools.length).toBe(32)
  })

  it('manages categories: create, rename, refuse to delete while in use, move words out, delete', async () => {
    type Cat = { id: number; category: string; total: number }
    const call = async (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args })
    const categories = async () => text(await call('imposter_list_categories', {})) as Cat[]

    const created = text(await call('imposter_create_category', { name: 'Board Games' })) as { id: number; name: string }
    expect(created.name).toBe('Board Games')
    expect((await categories()).find((c) => c.id === created.id)).toMatchObject({ total: 0 })
    const dup = await call('imposter_create_category', { name: 'board games' })
    expect(dup.isError).toBe(true)
    expect(JSON.stringify(dup.content)).toContain('already a category called')

    expect(text(await call('imposter_rename_category', { id: created.id, name: 'Games' }))).toMatchObject({ name: 'Games' })
    await call('imposter_add_words', { words: [{ category: 'games', word: 'Chess', hint: 'Kings and queens' }] })

    const refused = await call('imposter_delete_category', { id: created.id })
    expect(refused.isError).toBe(true)
    expect(JSON.stringify(refused.content)).toContain('still has words')

    // move Chess out by category name (created on the fly), then the empty category can go
    const chess = (text(await call('imposter_search_words', { categoryId: created.id })) as { words: { id: number }[] }).words[0]!
    const moved = text(await call('imposter_update_word', { id: chess.id, category: 'Strategy', hint: 'Checkmate wins' }))
    expect(moved).toMatchObject({ category: 'Strategy', word: 'Chess', hint: 'Checkmate wins' })
    expect(text(await call('imposter_delete_category', { id: created.id }))).toEqual({ deleted: 'Games' })
    expect((await categories()).map((c) => c.category)).toEqual(['Animals', 'Food', 'Strategy'])

    // bad edits come back as tool errors
    const bad = await call('imposter_update_word', { id: chess.id, hint: 'Chess is fun' })
    expect(bad.isError).toBe(true)
    expect(JSON.stringify(bad.content)).toContain('Hint must not contain the word')
  })
})
