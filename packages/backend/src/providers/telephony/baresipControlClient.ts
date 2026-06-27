import { EventEmitter } from 'node:events'
import net from 'node:net'
import { randomUUID } from 'node:crypto'

/**
 * Minimal client for baresip's `ctrl_tcp` module.
 *
 * baresip frames every message as a netstring: `<byteLength>:<payload>,`.
 * - Commands we send look like `{"command":"dial","params":"sip:..","token":".."}`.
 * - Responses come back as `{"response":true,"ok":true,"data":"..","token":".."}`.
 * - Asynchronous call events look like
 *   `{"event":true,"class":"call","type":"CALL_ESTABLISHED","peeruri":"sip:..","id":".."}`.
 *
 * We keep this intentionally thin: the telephony gateway layers the actual
 * answer/record/dial orchestration on top of `command()` + the `'event'` signal.
 */

export interface BaresipEvent {
  event: true
  class?: string
  type?: string
  param?: string
  accountaor?: string
  direction?: 'incoming' | 'outgoing'
  peeruri?: string
  peerdisplayname?: string
  id?: string
  [key: string]: unknown
}

interface BaresipResponse {
  response: true
  ok: boolean
  data?: string
  token?: string
}

interface PendingCommand {
  resolve: (data: string) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export interface BaresipControlClientOptions {
  host: string
  port: number
  /** Per-command response timeout in ms. */
  commandTimeoutMs?: number
  /** Base reconnect delay in ms (exponential backoff up to ~30s). */
  reconnectBaseDelayMs?: number
}

export declare interface BaresipControlClient {
  on(event: 'event', listener: (event: BaresipEvent) => void): this
  on(event: 'connect', listener: () => void): this
  on(event: 'close', listener: () => void): this
  on(event: 'error', listener: (error: Error) => void): this
}

export class BaresipControlClient extends EventEmitter {
  private socket: net.Socket | null = null
  private buffer = Buffer.alloc(0)
  private readonly pending = new Map<string, PendingCommand>()
  private reconnectAttempts = 0
  private stopped = false
  private connected = false

  private readonly host: string
  private readonly port: number
  private readonly commandTimeoutMs: number
  private readonly reconnectBaseDelayMs: number

  constructor(options: BaresipControlClientOptions) {
    super()
    this.host = options.host
    this.port = options.port
    this.commandTimeoutMs = options.commandTimeoutMs ?? 10_000
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1_000
  }

  isConnected() {
    return this.connected
  }

  start() {
    this.stopped = false
    this.connect()
  }

  stop() {
    this.stopped = true
    this.socket?.destroy()
    this.socket = null
    this.connected = false
    for (const [token, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('baresip control client stopped'))
      this.pending.delete(token)
    }
  }

  /**
   * Send a command to baresip and resolve with the textual response data.
   * `params` mirrors what you'd type after the command in baresip's menu.
   */
  command(name: string, params = ''): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error('baresip control client is not connected'))
        return
      }

      const token = randomUUID()
      const payload = JSON.stringify({ command: name, params, token })
      const frame = `${Buffer.byteLength(payload)}:${payload},`

      const timer = setTimeout(() => {
        this.pending.delete(token)
        reject(new Error(`baresip command "${name}" timed out`))
      }, this.commandTimeoutMs)

      this.pending.set(token, { resolve, reject, timer })
      this.socket.write(frame, error => {
        if (error) {
          clearTimeout(timer)
          this.pending.delete(token)
          reject(error)
        }
      })
    })
  }

  private connect() {
    if (this.stopped) return

    const socket = net.createConnection(
      { host: this.host, port: this.port },
      () => {
        this.connected = true
        this.reconnectAttempts = 0
        this.emit('connect')
      }
    )
    this.socket = socket

    socket.on('data', chunk => this.onData(chunk))
    socket.on('error', error => this.emit('error', error))
    socket.on('close', () => {
      this.connected = false
      this.emit('close')
      this.scheduleReconnect()
    })
  }

  private scheduleReconnect() {
    if (this.stopped) return
    this.reconnectAttempts += 1
    const delay = Math.min(
      this.reconnectBaseDelayMs * 2 ** (this.reconnectAttempts - 1),
      30_000
    )
    setTimeout(() => this.connect(), delay)
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])

    // Drain as many complete netstrings as are buffered.
    for (;;) {
      const colon = this.buffer.indexOf(0x3a) // ':'
      if (colon === -1) return

      const lengthText = this.buffer.subarray(0, colon).toString('ascii')
      const length = Number(lengthText)
      if (!Number.isInteger(length)) {
        // Unparseable framing — drop the buffer to resync rather than wedge.
        this.buffer = Buffer.alloc(0)
        return
      }

      const payloadStart = colon + 1
      const payloadEnd = payloadStart + length
      // Need the payload plus the trailing comma terminator.
      if (this.buffer.length < payloadEnd + 1) return

      const payload = this.buffer
        .subarray(payloadStart, payloadEnd)
        .toString('utf8')
      this.buffer = this.buffer.subarray(payloadEnd + 1)

      this.dispatch(payload)
    }
  }

  private dispatch(payload: string) {
    let message: unknown
    try {
      message = JSON.parse(payload)
    } catch {
      return
    }

    if (!message || typeof message !== 'object') return

    if ('response' in message) {
      const response = message as BaresipResponse
      const token = response.token
      const pending = token ? this.pending.get(token) : undefined
      if (token && pending) {
        clearTimeout(pending.timer)
        this.pending.delete(token)
        if (response.ok) {
          pending.resolve(response.data ?? '')
        } else {
          pending.reject(new Error(response.data || 'baresip command failed'))
        }
      }
      return
    }

    if ('event' in message) {
      this.emit('event', message as BaresipEvent)
    }
  }
}
