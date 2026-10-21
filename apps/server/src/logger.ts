/**
 * Minimal leveled logger. Writes to stderr only, so the same logger is safe
 * inside the stdio MCP process (where stdout is the protocol).
 */
import type { Logger } from '@wsfg/core/contract'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 }

export interface AppLogger extends Logger {
  debug(message: string, extra?: Record<string, unknown>): void
  child(name: string): AppLogger
}

export function createLogger(name: string, level: LogLevel = 'info'): AppLogger {
  const write = (lvl: Exclude<LogLevel, 'silent'>, message: string, extra?: Record<string, unknown>) => {
    if (ORDER[lvl] < ORDER[level]) return
    const tail = extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : ''
    process.stderr.write(`${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} [${name}] ${message}${tail}\n`)
  }
  return {
    debug: (m, e) => write('debug', m, e),
    info: (m, e) => write('info', m, e),
    warn: (m, e) => write('warn', m, e),
    error: (m, e) => write('error', m, e),
    child: (child) => createLogger(`${name}:${child}`, level),
  }
}
