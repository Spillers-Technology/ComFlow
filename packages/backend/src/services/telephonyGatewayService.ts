import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import {
  BaresipControlClient,
  BaresipEvent,
} from '../providers/telephony/baresipControlClient.js'
import { AudioPromptService } from './audioPromptService.js'
import { CallIngestionService } from './callIngestionService.js'

/**
 * baresip ctrl command names. They map to the equivalent baresip menu keys and
 * are gathered here so they can be tuned to a specific baresip build/modules
 * without touching the orchestration below.
 */
const CMD = {
  accept: 'accept',
  hangup: 'hangup',
  dial: 'dial',
  // Best-effort: switch the call's audio source to a file so a greeting /
  // pre-generated message is played to the far end. Requires the `aufile`
  // module; failures here are non-fatal (we still capture the recording).
  playFile: 'ausrc',
} as const

export interface OutboundCallRequest {
  toNumber: string
  /** Pre-generated WAV played to the callee once they answer. */
  messageAudioPath: string | null
  /** Pre-generated WAV asking the single question. */
  questionAudioPath: string | null
  /** How long to keep the call up capturing the answer, in ms. */
  recordWindowMs: number
}

export interface OutboundCallResult {
  status: 'completed' | 'no_answer' | 'failed'
  providerCallId: string | null
  /** Absolute path to the captured WAV, when one was produced. */
  recordingPath: string | null
}

function extractNumberFromUri(uri: string | undefined): string {
  if (!uri) return 'unknown'
  // sip:+15551234567@host;params -> +15551234567
  const match = uri.match(/sip:([^@;]+)/i)
  return match?.[1] ?? uri
}

async function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

/**
 * Bridges a real SIP UA (baresip, the "SIP edge") to ComFlow's existing
 * ingestion pipeline. Inbound: answer -> play greeting -> let baresip's sndfile
 * module record -> on hangup ingest the WAV through CallIngestionService.
 * Outbound (used by the scheduled-call feature): dial -> play message+question
 * -> capture a best-effort answer.
 *
 * baresip owns all SIP/RTP. This class only sends ctrl commands and reacts to
 * call events; it writes no telephony protocol code.
 */
export class TelephonyGatewayService {
  private readonly client: BaresipControlClient
  // Tracks inbound calls between CALL_ESTABLISHED and CALL_CLOSED.
  private readonly inbound = new Map<
    string,
    { fromNumber: string; startedAt: number }
  >()

  constructor(
    private readonly callIngestionService: CallIngestionService,
    private readonly audioPromptService: AudioPromptService
  ) {
    this.client = new BaresipControlClient({
      host: config.telephony.baresipCtrlHost,
      port: config.telephony.baresipCtrlPort,
    })
  }

  start() {
    this.client.on('connect', () => {
      console.log(
        `Connected to baresip ctrl at ${config.telephony.baresipCtrlHost}:${config.telephony.baresipCtrlPort}`
      )
    })
    this.client.on('error', error => {
      console.warn(`baresip ctrl error: ${error.message}`)
    })
    this.client.on('event', event => {
      void this.onEvent(event)
    })
    this.client.start()
  }

  stop() {
    this.client.stop()
  }

  isConnected() {
    return this.client.isConnected()
  }

  private async onEvent(event: BaresipEvent) {
    if (event.class && event.class !== 'call') return
    // Outbound calls are driven synchronously inside placeOutboundCall().
    if (event.direction === 'outgoing') return

    const callId = event.id ?? 'unknown'

    switch (event.type) {
      case 'CALL_INCOMING':
        await this.handleIncoming(callId, event)
        break
      case 'CALL_CLOSED':
        await this.handleClosed(callId)
        break
      default:
        break
    }
  }

  private async handleIncoming(callId: string, event: BaresipEvent) {
    const fromNumber = extractNumberFromUri(event.peeruri)
    this.inbound.set(callId, { fromNumber, startedAt: Date.now() })

    try {
      await this.client.command(CMD.accept)
    } catch (error) {
      console.warn(`Failed to accept inbound call: ${(error as Error).message}`)
      return
    }

    // Greeting is best-effort; baresip's sndfile module records the call body.
    const greetingPath = this.resolveGreetingPath()
    if (greetingPath) {
      try {
        await this.client.command(CMD.playFile, greetingPath)
      } catch (error) {
        console.warn(`Greeting playback failed: ${(error as Error).message}`)
      }
    }
  }

  /**
   * Greeting source: an explicit COMFLOW_GREETING_PATH wins; otherwise the most
   * recent uploaded 'greeting' prompt. Both resolve to a path on the shared
   * /data volume that baresip can read.
   */
  private resolveGreetingPath(): string | null {
    if (config.telephony.greetingPath) return config.telephony.greetingPath
    const [latest] = this.audioPromptService.list('greeting')
    return latest ? this.audioPromptService.resolveAudioPath(latest.id) : null
  }

  private async handleClosed(callId: string) {
    const tracked = this.inbound.get(callId)
    if (!tracked) return
    this.inbound.delete(callId)

    const telephonyCallId = `baresip-${callId}-${tracked.startedAt}`

    try {
      const call = await this.callIngestionService.createInboundCall({
        telephonyCallId,
        source: 'telephony',
        fromNumber: tracked.fromNumber,
      })

      const recordingPath = await this.findRecordingSince(tracked.startedAt)
      const recordingBase64 = recordingPath
        ? (await fs.readFile(recordingPath)).toString('base64')
        : undefined

      await this.callIngestionService.processRecordingComplete({
        telephonyCallId,
        recordingBase64,
        mimeType: 'audio/wav',
      })

      console.log(`Ingested inbound voicemail ${call.id} from ${tracked.fromNumber}`)
    } catch (error) {
      console.error(
        `Failed to ingest inbound voicemail: ${(error as Error).message}`
      )
    }
  }

  /**
   * baresip's sndfile module auto-records each call into rawRecordingsDir.
   * Correlate by picking the newest WAV created at/after the call start.
   */
  private async findRecordingSince(startedAt: number): Promise<string | null> {
    try {
      const entries = await fs.readdir(config.rawRecordingsDir)
      let newest: { file: string; mtimeMs: number } | null = null

      for (const entry of entries) {
        if (!entry.toLowerCase().endsWith('.wav')) continue
        const absolute = path.join(config.rawRecordingsDir, entry)
        const stat = await fs.stat(absolute)
        // Allow a small slack for clock differences between processes.
        if (stat.mtimeMs + 2_000 < startedAt) continue
        if (!newest || stat.mtimeMs > newest.mtimeMs) {
          newest = { file: absolute, mtimeMs: stat.mtimeMs }
        }
      }

      return newest?.file ?? null
    } catch {
      return null
    }
  }

  /**
   * Place a tightly-scoped outbound call: dial, play the pre-generated message
   * and question on answer, then keep the line up for a best-effort capture of
   * the callee's reply. No answering-machine detection — if a machine picks up
   * we still play and record.
   */
  async placeOutboundCall(
    request: OutboundCallRequest
  ): Promise<OutboundCallResult> {
    if (!this.client.isConnected()) {
      return { status: 'failed', providerCallId: null, recordingPath: null }
    }

    const providerCallId = `baresip-out-${randomUUID()}`
    const startedAt = Date.now()
    const dialUri = config.telephony.sipOutboundDomain
      ? `sip:${request.toNumber}@${config.telephony.sipOutboundDomain}`
      : request.toNumber

    const established = this.waitForOutboundEstablished(
      config.telephony.outboundAnswerTimeoutSec * 1000
    )

    try {
      await this.client.command(CMD.dial, dialUri)
    } catch {
      return { status: 'failed', providerCallId, recordingPath: null }
    }

    const answered = await established
    if (!answered) {
      try {
        await this.client.command(CMD.hangup)
      } catch {
        /* already gone */
      }
      return { status: 'no_answer', providerCallId, recordingPath: null }
    }

    // Play the message, then the single question. Best-effort; recording still
    // captures whatever the far end says.
    for (const audioPath of [
      request.messageAudioPath,
      request.questionAudioPath,
    ]) {
      if (!audioPath) continue
      try {
        await this.client.command(CMD.playFile, audioPath)
      } catch {
        /* playback unsupported on this build — continue to capture */
      }
    }

    await delay(request.recordWindowMs)

    try {
      await this.client.command(CMD.hangup)
    } catch {
      /* already gone */
    }

    const recordingPath = await this.findRecordingSince(startedAt)
    return { status: 'completed', providerCallId, recordingPath }
  }

  private waitForOutboundEstablished(timeoutMs: number): Promise<boolean> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.client.off('event', onEvent)
        resolve(false)
      }, timeoutMs)

      const onEvent = (event: BaresipEvent) => {
        if (event.class && event.class !== 'call') return
        if (event.direction !== 'outgoing') return
        if (event.type === 'CALL_ESTABLISHED') {
          clearTimeout(timer)
          this.client.off('event', onEvent)
          resolve(true)
        } else if (event.type === 'CALL_CLOSED') {
          clearTimeout(timer)
          this.client.off('event', onEvent)
          resolve(false)
        }
      }

      this.client.on('event', onEvent)
    })
  }
}
