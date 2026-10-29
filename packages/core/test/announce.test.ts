import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { announce, liveMessage } from '../src/ui/announce.ts'

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
