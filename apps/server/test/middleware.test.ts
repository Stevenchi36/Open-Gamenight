import { describe, expect, it } from 'vitest'
import { clientIp, isAllowedOrigin, RateLimiter } from '../src/middleware.ts'

describe('clientIp', () => {
  const none = { REAL_IP_HEADER: '', TRUSTED_PROXY_HOPS: 0 }

  it('uses the socket address when there are no proxies, ignoring X-Forwarded-For', () => {
    expect(clientIp({ 'x-forwarded-for': '6.6.6.6' }, '::ffff:192.168.1.5', none)).toBe('192.168.1.5')
  })

  it('reads the configured real-IP header (Cloudflare)', () => {
    const cf = { REAL_IP_HEADER: 'cf-connecting-ip', TRUSTED_PROXY_HOPS: 2 }
    expect(clientIp({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '6.6.6.6' }, '127.0.0.1', cf)).toBe(
      '203.0.113.7',
    )
    expect(clientIp({}, '127.0.0.1', cf)).toBe('127.0.0.1')
  })

  it('walks X-Forwarded-For from the right, skipping trusted hops', () => {
    const two = { REAL_IP_HEADER: '', TRUSTED_PROXY_HOPS: 2 }
    // client spoofs 6.6.6.6; Cloudflare appends the real client; nginx is the socket peer
    expect(clientIp({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 172.70.1.1' }, '127.0.0.1', two)).toBe('203.0.113.7')
    const one = { REAL_IP_HEADER: '', TRUSTED_PROXY_HOPS: 1 }
    expect(clientIp({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }, '127.0.0.1', one)).toBe('203.0.113.7')
    expect(clientIp({}, '127.0.0.1', one)).toBe('127.0.0.1')
  })
})

describe('isAllowedOrigin', () => {
  const config = { ALLOWED_ORIGINS: ['https://games.example.com'] }
  it('matches exactly, ignoring a trailing slash', () => {
    expect(isAllowedOrigin('https://games.example.com', config)).toBe(true)
    expect(isAllowedOrigin('https://games.example.com/', config)).toBe(true)
    expect(isAllowedOrigin('https://games.example.com.evil.com', config)).toBe(false)
    expect(isAllowedOrigin('http://games.example.com', config)).toBe(false)
    expect(isAllowedOrigin(undefined, config)).toBe(false)
  })
})

describe('RateLimiter', () => {
  it('allows max hits per window, then resets', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 2 })
    expect([limiter.consume('a', 0), limiter.consume('a', 1), limiter.consume('a', 2)]).toEqual([true, true, false])
    expect(limiter.consume('b', 2)).toBe(true)
    expect(limiter.consume('a', 1000)).toBe(true)
  })
})
