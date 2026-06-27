import fs from 'node:fs/promises'
import path from 'node:path'
import { CallRecord } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { callRepository } from '../repositories/callRepository.js'

const PROVIDER = 'anchordesk'

function mapPriority(urgency: CallRecord['urgency']): string {
  switch (urgency) {
    case 'high':
      return 'High'
    case 'low':
      return 'Low'
    default:
      return 'Medium'
  }
}

function ticketTitle(call: CallRecord): string {
  const who = call.callerName ?? call.callbackNumber ?? 'unknown caller'
  return `Voicemail from ${who}`
}

/**
 * One-way push of reviewed ("gilded") voicemails into AnchorDesk as tickets.
 *
 * Matches AnchorDesk's documented API (github.com/.../AnchorDesk):
 *   - POST   {baseUrl}/api/tickets                 (JSON, camelCase fields)
 *   - POST   {baseUrl}/api/tickets/:id/attachments (multipart/form-data)
 *   - auth:  Authorization: Bearer <adk_… personal access token>
 * Idempotency is twofold: ComFlow skips already-synced calls, and AnchorDesk's
 * unique (externalId, externalProvider) constraint dedupes server-side.
 * ANCHORDESK_BASE_URL is the public base (e.g. https://tickets.example.com); the
 * web tier proxies /api/* to the backend.
 */
export class AnchordeskSyncService {
  isEnabled(): boolean {
    return Boolean(
      config.anchordesk.syncEnabled &&
        config.anchordesk.baseUrl &&
        config.anchordesk.apiToken
    )
  }

  /** Sync a call if eligible. Idempotent: a call is only pushed once. */
  async syncCall(call: CallRecord): Promise<void> {
    if (!this.isEnabled()) return
    if (call.syncedTicketId) return

    const ticketId = await this.createTicket(call)
    if (call.recordingPath) {
      await this.uploadRecording(ticketId, call.recordingPath)
    }
    callRepository.markSynced(call.id, { ticketId, provider: PROVIDER })
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${config.anchordesk.apiToken}` }
  }

  private async createTicket(call: CallRecord): Promise<string> {
    const response = await fetch(`${config.anchordesk.baseUrl}/api/tickets`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: ticketTitle(call),
        summary: call.summary ?? undefined,
        description: call.transcript ?? call.summary ?? '',
        priority: mapPriority(call.urgency),
        companyName: call.company ?? undefined,
        source: 'api',
        externalProvider: 'comflow',
        externalId: call.id,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `AnchorDesk ticket create failed (${response.status}): ${body}`
      )
    }

    // POST /tickets returns the created ticket directly (201) with a numeric id.
    const json = (await response.json()) as { id?: unknown }
    if (json.id === undefined || json.id === null) {
      throw new Error('AnchorDesk did not return a ticket id.')
    }
    return String(json.id)
  }

  private async uploadRecording(
    ticketId: string,
    recordingPath: string
  ): Promise<void> {
    try {
      const absolutePath = path.resolve(config.dataDir, recordingPath)
      if (!absolutePath.startsWith(config.recordingsDir)) return

      const data = await fs.readFile(absolutePath)
      const form = new FormData()
      form.append(
        'file',
        new Blob([new Uint8Array(data)], { type: 'audio/wav' }),
        path.basename(absolutePath)
      )

      const response = await fetch(
        `${config.anchordesk.baseUrl}/api/tickets/${ticketId}/attachments`,
        {
          method: 'POST',
          headers: this.authHeaders(),
          body: form,
        }
      )

      if (!response.ok) {
        const body = await response.text()
        console.warn(
          `AnchorDesk attachment upload failed (${response.status}): ${body}`
        )
      }
    } catch (error) {
      // Best-effort: the ticket already exists; don't fail the sync on the file.
      console.warn(`AnchorDesk attachment upload error: ${(error as Error).message}`)
    }
  }
}
