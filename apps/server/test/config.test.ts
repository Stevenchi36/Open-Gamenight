import { describe, expect, it } from 'vitest'
import { parseConfig } from '../src/config.ts'

const base = {
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'https://games.example.com',
  ALLOWED_ORIGINS: 'https://games.example.com/, https://other.example.com',
}

describe('parseConfig', () => {
  it('applies defaults, splits origins and resolves paths against the root', () => {
    const config = parseConfig(base, '/srv/ogn')
    expect(config.ALLOWED_ORIGINS).toEqual(['https://games.example.com', 'https://other.example.com'])
    expect(config.PORT).toBe(3000)
    expect(config.MAX_ROOMS_PER_USER).toBe(2)
    expect(config.ROOM_CREATION).toBe('accounts')
    expect(config.ANTHROPIC_API_KEY).toBeUndefined()
    expect(config.gamesDbPath.replace(/\\/g, '/')).toMatch(/\/srv\/ogn\/data\/games\.db$/)
  })

  it('lists every problem at once', () => {
    let error = ''
    try {
      parseConfig({ APP_PRIMARY_COLOR: '' })
    } catch (e) {
      error = String(e)
    }
    for (const key of ['BETTER_AUTH_SECRET', 'BETTER_AUTH_URL', 'ALLOWED_ORIGINS', 'APP_PRIMARY_COLOR']) {
      expect(error).toContain(key)
    }
  })

  it('treats a blank API key as unset', () => {
    expect(parseConfig({ ...base, ANTHROPIC_API_KEY: '  ' }).ANTHROPIC_API_KEY).toBeUndefined()
  })
})
