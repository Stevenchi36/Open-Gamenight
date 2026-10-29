import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { announce, liveMessage, progressText } from '../src/ui/announce.ts'

describe('progressText', () => {
  const name = (id: string) => id.toUpperCase()
  const answered = (who: string) => `${who} answered`

  it('names who just finished, and how many are done', () => {
    expect(progressText(['a', 'b'], ['a'], 4, answered, 'me', name)).toBe('B answered, 2 of 4')
  })

  it('joins several names, with you first', () => {
    expect(progressText(['a', 'b', 'me', 'c'], ['a'], 5, answered, 'me', name)).toBe('You, B and C answered, 4 of 5')
  })

  it('passes the count so the verb can agree', () => {
    const ready = (who: string, n: number) => `${who} ${who === 'You' || n > 1 ? 'are' : 'is'} ready`
    expect(progressText(['b'], [], 3, ready, 'me', name)).toBe('B is ready, 1 of 3')
    expect(progressText(['b', 'c'], [], 3, ready, 'me', name)).toBe('B and C are ready, 2 of 3')
  })

  it('says nothing when nobody new is done', () => {
    expect(progressText(['a'], ['a', 'b'], 3, answered, 'me', name)).toBeNull()
  })
})

describe('announce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('empties the region, then fills it a moment later', () => {
    announce('Your move')
    expect(liveMessage.value).toBe('')
    vi.advanceTimersByTime(100)
    expect(liveMessage.value).toBe('Your move.')
  })

  it('reads texts announced together as one message, `last` ones at the end', () => {
    announce('Your move', { last: true })
    announce('Al played a red 7.')
    vi.advanceTimersByTime(100)
    expect(liveMessage.value).toBe('Al played a red 7. Your move.')
  })

  it('drops a repeat within one message, but reads the same words again later', () => {
    announce('Your move')
    announce('Your move')
    vi.advanceTimersByTime(100)
    expect(liveMessage.value).toBe('Your move.')
    announce('Your move')
    expect(liveMessage.value).toBe('')
    vi.advanceTimersByTime(100)
    expect(liveMessage.value).toBe('Your move.')
  })
})
