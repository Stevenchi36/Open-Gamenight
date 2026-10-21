/**
 * Request guards. Everything that matters is enforced here, server side;
 * client route guards and hidden buttons are UX only.
 */
import type { IncomingHttpHeaders } from 'node:http'
import { fromNodeHeaders } from 'better-auth/node'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { INTERNAL_IP_HEADER, toSessionUser, type Auth, type SessionUser } from './auth.ts'
import type { Config } from './config.ts'

// ---------------------------------------------------------------- client IP

/**
 * The real client IP. With REAL_IP_HEADER set (e.g. cf-connecting-ip) that
 * header wins. Otherwise walk X-Forwarded-For from the right, skipping
 * TRUSTED_PROXY_HOPS proxies. With no proxies, the socket address.
 * Works for both Express requests and raw upgrade requests.
 */
export function clientIp(
  headers: IncomingHttpHeaders,
  remoteAddress: string | undefined,
  config: Pick<Config, 'REAL_IP_HEADER' | 'TRUSTED_PROXY_HOPS'>,
): string {
  const socketIp = normalizeIp(remoteAddress ?? 'unknown')
  if (config.REAL_IP_HEADER) {
    const value = headers[config.REAL_IP_HEADER]
    const ip = (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim()
    return ip ? normalizeIp(ip) : socketIp
  }
  if (config.TRUSTED_PROXY_HOPS > 0) {
    const raw = headers['x-forwarded-for']
    const forwarded = (Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const chain = [...forwarded, socketIp]
    return normalizeIp(chain[Math.max(0, chain.length - 1 - config.TRUSTED_PROXY_HOPS)]!)
  }
  return socketIp
}

function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

/** Compute the client IP once; expose it as res.locals.ip and to Better Auth. */
export function realIp(config: Config): RequestHandler {
  return (req, res, next) => {
    const ip = clientIp(req.headers, req.socket.remoteAddress, config)
    req.headers[INTERNAL_IP_HEADER] = ip // overwrites anything the client sent
    res.locals.ip = ip
    next()
  }
}

// ---------------------------------------------------------------- origin

export function isAllowedOrigin(origin: string | undefined, config: Pick<Config, 'ALLOWED_ORIGINS'>): boolean {
  return !!origin && config.ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ''))
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** State-changing requests must carry an allowed Origin (on top of SameSite cookies). */
export function originCheck(config: Config): RequestHandler {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next()
    if (!isAllowedOrigin(req.get('origin'), config)) {
      res.status(403).json({ error: 'forbidden', message: 'Bad origin' })
      return
    }
    next()
  }
}

// ---------------------------------------------------------------- sessions

export async function getSessionUser(auth: Auth, headers: IncomingHttpHeaders): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) })
  if (!session || session.user.banned) return null
  return toSessionUser(session.user)
}

export function sessionUser(res: Response): SessionUser {
  const user = res.locals.user as SessionUser | undefined
  if (!user) throw new Error('sessionUser() used on a route without requireSession')
  return user
}

export function requireSession(auth: Auth): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await getSessionUser(auth, req.headers)
    if (!user) {
      res.status(401).json({ error: 'unauthorized', message: 'Sign in first' })
      return
    }
    res.locals.user = user
    next()
  }
}

/** Role comes from the server-side session, never from the client. */
export function requireAdmin(auth: Auth): RequestHandler {
  const session = requireSession(auth)
  return (req, res, next) => {
    void session(req, res, () => {
      if (sessionUser(res).role !== 'admin') {
        res.status(403).json({ error: 'forbidden', message: 'Admins only' })
        return
      }
      next()
    })
  }
}

// ---------------------------------------------------------------- rate limit

/** Fixed-window in-memory counter. Good enough for one process. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>()
  private readonly windowMs: number
  private readonly max: number

  constructor(options: { windowMs: number; max: number }) {
    this.windowMs = options.windowMs
    this.max = options.max
  }

  /** Records one hit; returns false when the key is over its limit. */
  consume(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      if (this.hits.size > 10_000) this.sweep(now)
      return true
    }
    entry.count++
    return entry.count <= this.max
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key)
  }
}

export function rateLimit(limiter: RateLimiter, keyOf: (req: Request, res: Response) => string): RequestHandler {
  return (req, res, next) => {
    if (!limiter.consume(keyOf(req, res))) {
      res.status(429).json({ error: 'rate_limited', message: 'Too many requests, slow down' })
      return
    }
    next()
  }
}
