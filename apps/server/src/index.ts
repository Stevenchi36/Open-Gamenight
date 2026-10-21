/** Server entry point: boot, listen, shut down cleanly on SIGTERM/SIGINT. */
import { createServer } from 'node:http'
import { createApp, createServices } from './app.ts'
import { boot } from './boot.ts'
import { loadConfig } from './config.ts'
import { RoomManager } from './rooms.ts'
import { attachWebSocket } from './ws.ts'

const booted = await boot(loadConfig())
const { config, logger, auth, games } = booted
const server = createServer(createApp(booted))
const rooms = new RoomManager({
  games,
  config,
  logger: logger.child('rooms'),
  servicesFor: (game) => createServices(booted, game),
})
const ws = attachWebSocket(server, { config, auth, rooms, logger: logger.child('ws') })

server.listen(config.PORT, () => {
  logger.info(`listening on http://localhost:${config.PORT}`, { env: config.NODE_ENV })
})

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info(`${signal} received, shutting down`)
  setTimeout(() => process.exit(0), 5_000).unref()
  await ws.shutdown()
  server.close(() => {
    booted.close()
    process.exit(0)
  })
  server.closeAllConnections()
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
