/** Server entry point: boot, listen, shut down cleanly on SIGTERM/SIGINT. */
import { createServer } from 'node:http'
import { createApp } from './app.ts'
import { boot } from './boot.ts'
import { loadConfig } from './config.ts'

const booted = await boot(loadConfig())
const { config, logger } = booted
const app = createApp(booted)
const server = createServer(app)

server.listen(config.PORT, () => {
  logger.info(`listening on http://localhost:${config.PORT}`, { env: config.NODE_ENV })
})

let shuttingDown = false
function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`${signal} received, shutting down`)
  server.close(() => {
    booted.close()
    process.exit(0)
  })
  server.closeAllConnections()
  setTimeout(() => process.exit(0), 5_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
