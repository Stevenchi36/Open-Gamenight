/** Server entry point: start, and shut down cleanly on SIGTERM/SIGINT. */
import { loadConfig } from './config.ts'
import { startServer } from './server.ts'

const running = await startServer(loadConfig())

function onSignal(signal: string) {
  running.booted.logger.info(`${signal} received`)
  setTimeout(() => process.exit(0), 5_000).unref()
  void running.shutdown().then(() => process.exit(0))
}
process.on('SIGTERM', () => onSignal('SIGTERM'))
process.on('SIGINT', () => onSignal('SIGINT'))
