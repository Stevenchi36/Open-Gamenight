import { describe, expect, it } from 'vitest'
import {
  AI_INSTRUCTIONS_MAX_LENGTH,
  assertValidGame,
  assertValidRegistry,
  categoryScope,
  gameError,
  instructionsLine,
  isGameError,
} from '../src/contract.ts'
import { makeOracle } from './fixtures/oracle.ts'

describe('assertValidGame', () => {
  it('accepts a well-formed game', () => {
    expect(() => assertValidGame(makeOracle())).not.toThrow()
  })

  it.each([
    ['bad id', { id: 'My-Game' }, /id must match/],
    ['id with underscore', { id: 'my_game' }, /id must match/],
    ['minPlayers < 1', { minPlayers: 0 }, /minPlayers/],
    ['maxPlayers over the cap', { maxPlayers: 13 }, /maxPlayers/],
    ['maxPlayers < minPlayers', { minPlayers: 4, maxPlayers: 3 }, /maxPlayers/],
    ['no styles', { styles: [] }, /styles/],
    ['a repeated style', { styles: ['card', 'card'] as const }, /styles/],
    ['defaults fail the schema', { defaultSettings: { rounds: 9 } }, /defaultSettings/],
    [
      'duplicate migration ids',
      { migrations: [{ id: '001', sql: '' }, { id: '001', sql: '' }] },
      /duplicate migration/,
    ],
    ['renamedFrom its own id', { renamedFrom: ['oracle'] }, /renamedFrom/],
    ['an invalid renamedFrom id', { renamedFrom: ['Old-Game'] }, /renamedFrom/],
  ])('rejects %s', (_label, patch, message) => {
    expect(() => assertValidGame({ ...makeOracle(), ...patch })).toThrow(message)
  })
})

describe('assertValidRegistry', () => {
  it('rejects an empty registry and duplicate ids', () => {
    expect(() => assertValidRegistry([])).toThrow(/empty/)
    expect(() => assertValidRegistry([makeOracle(), makeOracle()])).toThrow(/duplicate game id/)
  })

  it('rejects a renamedFrom id that another game still uses or also claims', () => {
    const renamed = (id: string) => ({ ...makeOracle(), id, renamedFrom: ['oracle'] })
    expect(() => assertValidRegistry([renamed('seer')])).not.toThrow()
    expect(() => assertValidRegistry([makeOracle(), renamed('seer')])).toThrow(/used by another game/)
    expect(() => assertValidRegistry([renamed('seer'), renamed('prophet')])).toThrow(/used by another game/)
  })
})

describe('isGameError', () => {
  it('tells errors from transitions', () => {
    expect(isGameError(gameError('nope'))).toBe(true)
    expect(isGameError({ state: {} })).toBe(false)
    expect(isGameError(null)).toBe(false)
  })
})

describe('instructionsLine', () => {
  it('is empty without instructions, and tidies and caps them otherwise', () => {
    expect(instructionsLine(null)).toBe('')
    expect(instructionsLine('   ')).toBe('')
    expect(instructionsLine('  Really   easy,\nfor young kids ')).toBe(
      'Extra instructions from the admin (follow them, within the rules above): Really easy, for young kids',
    )
    expect(instructionsLine('x'.repeat(900)).endsWith('x'.repeat(AI_INSTRUCTIONS_MAX_LENGTH))).toBe(true)
    expect(instructionsLine('x'.repeat(900)).length).toBeLessThan(AI_INSTRUCTIONS_MAX_LENGTH + 100)
  })
})

describe('categoryScope', () => {
  it('names the chosen category, else defers to the instructions, else asks for a mix', () => {
    expect(categoryScope('Space', 'easy ones')).toBe(' in the category "Space"')
    expect(categoryScope(null, '5 each for Dinosaurs and Space')).toContain('the categories the extra instructions name')
    expect(categoryScope(null, '  ')).toBe(' across a few fun, varied categories')
  })
})
