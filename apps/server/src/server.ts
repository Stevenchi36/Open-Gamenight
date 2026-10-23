/**
 * Wires everything together: boot (DBs, migrations, auth), HTTP app, rooms,
 * websockets, listen. index.ts calls this for real; tests call it with temp
 * databases and port 0, so both run the same startup and shutdown code.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp, createServices, readBuildId } from './app.ts'
import { boot, type BootOptions, type Booted } from './boot.ts'
import type { Config } from './config.ts'
import { RoomManager } from './rooms.ts'
import { attachWebSocket, type WsOptions } from './ws.ts'

export interface StartOptions extends BootOptions {
  ws?: Partial<Pick<WsOptions, 'heartbeatMs' | 'maxConnectionsPerIp' | 'messagesPerSecond'>>
  /** Defaults to config.PORT; pass 0 for a random port. */
  port?: number
  host?: string
}

export interface RunningServer {
  booted: Booted
  server: Server
  rooms: RoomManager
  ws: ReturnType<typeof attachWebSocket>
  /** e.g. http://127.0.0.1:53211 */
  url: string
  /** SIGTERM path: restart notice to every player, close sockets, stop HTTP, close DBs. */
  shutdown(): Promise<void>
}

export async function startServer(config: Config, options: StartOptions = {}): Promise<RunningServer> {
  const booted = await boot(config, options)
  const { logger, auth, games } = booted
  const rooms = new RoomManager({
    games,
    config,
    logger: logger.child('rooms'),
    servicesFor: (game) => createServices(booted, game),
  })
  const server = createServer(createApp({ ...booted, rooms }))
  const buildId = readBuildId(config.clientDistDir)
  const ws = attachWebSocket(server, { config, auth, rooms, logger: logger.child('ws'), buildId, ...options.ws })

  const port = options.port ?? config.PORT
  await new Promise<void>((resolve) => server.listen(port, options.host, resolve))
  const { port: actual } = server.address() as AddressInfo
  const url = `http://${options.host ?? 'localhost'}:${actual}`
  logger.info(`listening on ${url}`, { env: config.NODE_ENV })

  let stopping: Promise<void> | null = null
  const shutdown = () =>
    (stopping ??= (async () => {
      logger.info('shutting down')
      await ws.shutdown()
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      booted.close()
    })())

  return { booted, server, rooms, ws, url, shutdown }
}
