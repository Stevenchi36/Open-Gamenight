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
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let dir: string
let dbPath: string
let client: Client

const text = (result: { content: unknown }) => {
  const [first] = result.content as { type: string; text: string }[]
  return JSON.parse(first!.text) as unknown
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wsfg-mcp-'))
  dbPath = join(dir, 'games.db')
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
      'imposter_add_words',
      'imposter_list_categories',
      'imposter_remove_words',
      'imposter_search_words',
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
      skipped: [
        { word: 'OTTER', reason: 'Already in the library' },
        { word: 'Seal', reason: 'Hint must not contain the word' },
      ],
    })

    const db = new DatabaseSync(dbPath, { readOnly: true })
    expect(db.prepare('SELECT COUNT(*) AS n FROM imposter_words').get()).toEqual({ n: 21 })
    expect(db.prepare("SELECT DISTINCT source FROM imposter_words").all()).toEqual([{ source: 'claude' }])
    db.close()
  })

  it('lists categories with low-stock flags, searches and removes', async () => {
    const categories = text(await client.callTool({ name: 'imposter_list_categories', arguments: {} }))
    expect(categories).toEqual([
      { category: 'Animals', total: 10, unused: 10, runningLow: false },
      { category: 'Food', total: 11, unused: 11, runningLow: false },
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
    expect(tools.length).toBe(4)
  })
})
