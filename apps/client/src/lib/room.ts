/**
 * The room store: owns the one websocket, reconnects with the stored token,
 * and exposes the latest room + game views. A reactive object is enough here.
 *
 * Flow: connect() opens the socket; on open we resend `reconnect` if we have a
 * saved { code, token }. Drops retry with backoff; close code 1012 means the
 * server is restarting (shown as a calm message instead of a spinner).
 *
 * Watching (the watch page) sends `spectate_room` instead, on every (re)connect. It never
 * touches the saved seat; opening that room's page again takes the seat back (resumeSeat).
 */
import type { ClientMessage, RoomView, ServerMessage, SessionUser } from '@wsfg/core/protocol'
import { parseServerMessage, SPECTATOR_ID } from '@wsfg/core/protocol'
import { reactive } from 'vue'
import { load, remove, save } from '@wsfg/core/ui/storage'

const SAVED_KEY = 'wsfg.room'
const NAME_KEY = 'wsfg.name'

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'restarting'

interface SavedRoom {
  code: string
  token: string
}

export interface Toast {
  text: string
  color: 'error' | 'info' | 'warning' | 'success'
  timeout?: number
}

const state = reactive({
  status: 'idle' as ConnectionStatus,
  user: null as SessionUser | null,
  room: null as RoomView | null,
  game: null as unknown,
  playerId: null as string | null,
  /** server clock minus local clock, ms */
  clockOffset: 0,
  /** Set when the server told us we're out (kicked, room closed, other tab). */
  removedReason: null as string | null,
  toasts: [] as Toast[],
})

/** Treat as read-only outside this file; change it through the functions below. */
export const roomState = state
/** VSnackbarQueue needs a writable array. */
export const toasts = state.toasts

let socket: WebSocket | null = null
let retries = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let wanted = false
let reconnecting: SavedRoom | null = null
/** The room code the watch page is showing, or null. */
let watching: string | null = null
/** The server announced a restart; the next failed reconnect means the room ended. */
let restarted = false
const queue: ClientMessage[] = []
type Waiter = { resolve: (code: string) => void; reject: (error: Error) => void }
let joinWaiter: Waiter | null = null

export function toast(text: string, color: Toast['color'] = 'info'): void {
  state.toasts.push({ text, color, timeout: color === 'error' ? 6000 : 4000 })
}

export function serverNow(): number {
  return Date.now() + state.clockOffset
}

export function savedRoom(): SavedRoom | null {
  return load<SavedRoom>(SAVED_KEY)
}

export function lastName(): string {
  return load<string>(NAME_KEY) ?? ''
}

/** Open the socket (idempotent). */
export function connect(): void {
  wanted = true
  if (socket && socket.readyState <= WebSocket.OPEN) return
  open()
}

/** Reopen the socket so the server re-reads the session cookie (after sign-in/out). */
export function refreshSession(): void {
  if (!socket) return connect()
  const old = socket
  socket = null
  old.close(1000, 'session changed')
  open()
}

export function send(message: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  else {
    queue.push(message)
    connect()
  }
}

export function sendAction(action: unknown): void {
  send({ type: 'action', action })
}

export function createRoom(gameId: string, name: string): Promise<string> {
  save(NAME_KEY, name)
  return request({ type: 'create_room', gameId, name })
}

export function joinRoom(code: string, name: string): Promise<string> {
  save(NAME_KEY, name)
  return request({ type: 'join_room', code, name })
}

export function leaveRoom(): void {
  send({ type: 'leave' })
  clearRoom(null)
}

/** Watch a room without a seat. Failures land in `removedReason`, for the watch page to show. */
export function watchRoom(code: string): void {
  watching = code
  state.removedReason = null
  if (socket?.readyState === WebSocket.OPEN) sendNow(socket, { type: 'spectate_room', code })
  else connect() // onopen sends it
}

/**
 * Leave the watch page. A saved seat is left alone: the same account may be playing it on
 * another device now, and reconnecting here would pull it away. The room page takes it back.
 */
export function stopWatching(): void {
  if (!watching) return
  watching = null
  const spectating = state.room?.you.id === SPECTATOR_ID
  clearView(null)
  if (spectating) send({ type: 'leave' })
}

/**
 * Take this browser's saved seat in `code` back over an open socket (the room page, after
 * watching). A fresh socket needs no call: it reconnects on open.
 */
export function resumeSeat(code: string): void {
  const saved = savedRoom()
  if (saved?.code !== code || socket?.readyState !== WebSocket.OPEN || reconnecting) return
  if (state.room?.code === code && state.room.you.id !== SPECTATOR_ID) return
  reconnecting = saved
  sendNow(socket, { type: 'reconnect', code: saved.code, token: saved.token })
}

/** Forget a remembered room without telling the server (e.g. it no longer exists). */
export function forgetRoom(): void {
  remove(SAVED_KEY)
}

// ---------------------------------------------------------------- internals

function request(message: ClientMessage): Promise<string> {
  joinWaiter?.reject(new Error('Superseded'))
  return new Promise((resolve, reject) => {
    joinWaiter = { resolve, reject }
    state.removedReason = null
    send(message)
  })
}

function open(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  if (state.status !== 'restarting') state.status = retries === 0 ? 'connecting' : 'reconnecting'
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}/ws`)
  socket = ws

  ws.onopen = () => {
    if (socket !== ws) return
    retries = 0
    state.status = 'open'
    const saved = savedRoom()
    if (watching) sendNow(ws, { type: 'spectate_room', code: watching })
    else if (saved) {
      reconnecting = saved
      sendNow(ws, { type: 'reconnect', code: saved.code, token: saved.token })
    }
    for (const message of queue.splice(0)) sendNow(ws, message)
  }
  ws.onmessage = (event) => {
    const parsed = parseServerMessage(String(event.data))
    if (parsed.ok) handle(parsed.message)
  }
  ws.onclose = (event) => {
    if (socket !== ws) return
    socket = null
    if (event.code === 1012) restarted = true
    state.status = restarted ? 'restarting' : 'reconnecting'
    if (!wanted) return
    const delay = Math.min(10_000, 500 * 2 ** retries) + Math.random() * 300
    retries++
    retryTimer = setTimeout(open, delay)
  }
}

function handle(message: ServerMessage): void {
  switch (message.type) {
    case 'session':
      state.user = message.user
      if (message.build && __BUILD_ID__ && message.build !== __BUILD_ID__) reloadForBuild(message.build)
      return
    case 'joined':
      save(SAVED_KEY, { code: message.code, token: message.token })
      reconnecting = null
      restarted = false
      state.playerId = message.playerId
      state.removedReason = null
      joinWaiter?.resolve(message.code)
      joinWaiter = null
      return
    case 'state':
      // A spectate that landed after the watch page closed.
      if (message.room.you.id === SPECTATOR_ID && !watching) return send({ type: 'leave' })
      state.room = message.room
      state.game = message.game
      state.playerId = message.room.you.id
      state.clockOffset = message.now - Date.now()
      return
    case 'error':
      // Not watching yet, so this answers spectate_room; the watch page shows it.
      if (watching && state.room?.you.id !== SPECTATOR_ID) {
        state.removedReason = message.message
        return
      }
      if (reconnecting && message.code === 'not_found') {
        // our saved room is gone; forget it (and say why if the server restarted)
        reconnecting = null
        const reason = restarted ? 'The server restarted, so that room has ended. Start a new one.' : null
        restarted = false
        clearRoom(reason)
        if (reason) toast(reason, 'warning')
        if (!joinWaiter) return
      }
      if (joinWaiter) {
        joinWaiter.reject(new Error(message.message))
        joinWaiter = null
        return
      }
      toast(message.message, message.code === 'game' || message.code === 'validation' ? 'warning' : 'error')
      return
    case 'notice':
      if (message.kind === 'removed') {
        // The watched room closed; any seat this browser has elsewhere is untouched.
        if (watching) clearView(message.message)
        else clearRoom(message.message)
        toast(message.message, 'warning')
      } else if (message.kind === 'server_restarting') {
        state.status = 'restarting'
        restarted = true
      } else {
        toast(message.message, message.kind === 'warning' ? 'warning' : 'info')
      }
      return
  }
}

/**
 * The server is serving a newer client than this tab runs (a deploy happened), and the
 * old bundle may not understand its views. Reload once per build: if a cache keeps
 * serving the old bundle, carry on rather than loop.
 */
function reloadForBuild(build: string): void {
  const key = 'wsfg.reloadedFor'
  try {
    if (sessionStorage.getItem(key) === build) return
    sessionStorage.setItem(key, build)
  } catch {
    return // no storage, no loop guard: don't risk a reload loop
  }
  location.reload()
}

function sendNow(ws: WebSocket, message: ClientMessage): void {
  ws.send(JSON.stringify(message))
}

function clearRoom(reason: string | null): void {
  remove(SAVED_KEY)
  clearView(reason)
}

function clearView(reason: string | null): void {
  state.room = null
  state.game = null
  state.playerId = null
  state.removedReason = reason
}
