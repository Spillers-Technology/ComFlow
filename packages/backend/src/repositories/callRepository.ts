import { randomUUID } from 'node:crypto'
import {
  CallIntent,
  CallListItem,
  CallListItemSchema,
  CallRecord,
  CallRecordSchema,
  CallSource,
  CallStatus,
  CallUpdateInput,
  CallUrgency,
  ExtractedCallFields,
  RecordingStatus,
} from '../../../shared/src/index.js'
import { db } from '../db/client.js'

type CallRow = {
  id: string
  telephony_call_id: string | null
  source: CallSource
  caller_name: string | null
  company: string | null
  callback_number: string | null
  intent: CallIntent
  urgency: CallUrgency
  summary: string | null
  transcript: string | null
  raw_transcript: string | null
  status: CallStatus
  assigned_queue: string | null
  recording_status: RecordingStatus
  recording_path: string | null
  recording_mime_type: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  synced_ticket_id: string | null
  synced_ticket_provider: string | null
  synced_at: string | null
  email_notified_at: string | null
  mailbox_id: string | null
  tenant_id: string | null
  created_at: string
  updated_at: string
}

export type CallFilters = {
  status?: CallStatus
  intent?: CallIntent
  assignedQueue?: string
  q?: string
  // Tenant isolation: when present, only calls in this tenant are returned.
  tenantId?: string
  // RBAC scope: when present, only calls in these mailboxes are returned. An
  // empty array intentionally matches nothing (a member granted no mailboxes).
  mailboxIds?: string[]
}

export type CreateCallInput = {
  telephonyCallId: string
  source: CallSource
  callbackNumber: string | null
  transcript?: string
  mailboxId?: string | null
  tenantId?: string | null
}

function mapCall(row: CallRow): CallRecord {
  return CallRecordSchema.parse({
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    callerName: row.caller_name,
    company: row.company,
    callbackNumber: row.callback_number,
    intent: row.intent,
    urgency: row.urgency,
    summary: row.summary,
    transcript: row.transcript,
    status: row.status,
    assignedQueue: row.assigned_queue,
    recordingStatus: row.recording_status,
    recordingPath: row.recording_path,
    recordingMimeType: row.recording_mime_type,
    telephonyCallId: row.telephony_call_id,
    rawTranscript: row.raw_transcript,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    syncedTicketId: row.synced_ticket_id,
    syncedTicketProvider: row.synced_ticket_provider,
    syncedAt: row.synced_at,
    mailboxId: row.mailbox_id,
    source: row.source,
  })
}

function mapListItem(row: CallRow): CallListItem {
  return CallListItemSchema.parse({
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    callerName: row.caller_name,
    company: row.company,
    callbackNumber: row.callback_number,
    intent: row.intent,
    urgency: row.urgency,
    summary: row.summary,
    status: row.status,
    assignedQueue: row.assigned_queue,
    recordingStatus: row.recording_status,
    telephonyCallId: row.telephony_call_id,
    source: row.source,
  })
}

export const callRepository = {
  createInitial(input: CreateCallInput): CallRecord {
    const existing = input.telephonyCallId
      ? (db
          .prepare('SELECT * FROM calls WHERE telephony_call_id = ?')
          .get(input.telephonyCallId) as CallRow | undefined)
      : undefined

    if (existing) return mapCall(existing)

    const now = new Date().toISOString()
    const row: CallRow = {
      id: randomUUID(),
      telephony_call_id: input.telephonyCallId,
      source: input.source,
      caller_name: null,
      company: null,
      callback_number: input.callbackNumber,
      intent: 'unknown',
      urgency: 'unknown',
      summary: input.transcript ?? null,
      transcript: input.transcript ?? null,
      raw_transcript: null,
      status: 'new',
      assigned_queue: null,
      recording_status: 'missing',
      recording_path: null,
      recording_mime_type: null,
      reviewed_at: null,
      reviewed_by: null,
      synced_ticket_id: null,
      synced_ticket_provider: null,
      synced_at: null,
      email_notified_at: null,
      mailbox_id: input.mailboxId ?? null,
      tenant_id: input.tenantId ?? null,
      created_at: now,
      updated_at: now,
    }

    db.prepare(`
      INSERT INTO calls (
        id, telephony_call_id, source, caller_name, company, callback_number,
        intent, urgency, summary, transcript, raw_transcript, status,
        assigned_queue, recording_status, recording_path, recording_mime_type,
        reviewed_at, synced_ticket_id, synced_ticket_provider, synced_at,
        mailbox_id, tenant_id, created_at, updated_at
      )
      VALUES (
        @id, @telephony_call_id, @source, @caller_name, @company, @callback_number,
        @intent, @urgency, @summary, @transcript, @raw_transcript, @status,
        @assigned_queue, @recording_status, @recording_path, @recording_mime_type,
        @reviewed_at, @synced_ticket_id, @synced_ticket_provider, @synced_at,
        @mailbox_id, @tenant_id, @created_at, @updated_at
      )
    `).run(row)

    return mapCall(row)
  },

  list(filters: CallFilters): CallListItem[] {
    const where: string[] = []
    const values: unknown[] = []

    if (filters.tenantId) {
      where.push('tenant_id = ?')
      values.push(filters.tenantId)
    }
    if (filters.status) {
      where.push('status = ?')
      values.push(filters.status)
    }
    if (filters.intent) {
      where.push('intent = ?')
      values.push(filters.intent)
    }
    if (filters.assignedQueue) {
      where.push('assigned_queue = ?')
      values.push(filters.assignedQueue)
    }
    if (filters.q) {
      const query = `%${filters.q}%`
      where.push(`(
        coalesce(caller_name, '') LIKE ? OR
        coalesce(company, '') LIKE ? OR
        coalesce(summary, '') LIKE ? OR
        coalesce(callback_number, '') LIKE ?
      )`)
      values.push(query, query, query, query)
    }
    if (filters.mailboxIds) {
      if (filters.mailboxIds.length === 0) {
        where.push('0 = 1')
      } else {
        const placeholders = filters.mailboxIds.map(() => '?').join(', ')
        where.push(`mailbox_id IN (${placeholders})`)
        values.push(...filters.mailboxIds)
      }
    }

    const rows = db
      .prepare(`
        SELECT *
        FROM calls
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY datetime(created_at) DESC
      `)
      .all(...values) as CallRow[]

    return rows.map(mapListItem)
  },

  getById(id: string): CallRecord | null {
    const row = db.prepare('SELECT * FROM calls WHERE id = ?').get(id) as
      | CallRow
      | undefined
    return row ? mapCall(row) : null
  },

  /** The tenant a call belongs to, for metering and isolation checks. */
  tenantIdOf(id: string): string | null {
    const row = db
      .prepare('SELECT tenant_id FROM calls WHERE id = ?')
      .get(id) as { tenant_id: string | null } | undefined
    return row?.tenant_id ?? null
  },

  /** Tenant-scoped fetch: returns null if the call is outside the tenant. */
  getInTenant(id: string, tenantId: string): CallRecord | null {
    const row = db
      .prepare('SELECT * FROM calls WHERE id = ? AND tenant_id = ?')
      .get(id, tenantId) as CallRow | undefined
    return row ? mapCall(row) : null
  },

  getByTelephonyCallId(telephonyCallId: string): CallRecord | null {
    const row = db
      .prepare('SELECT * FROM calls WHERE telephony_call_id = ?')
      .get(telephonyCallId) as CallRow | undefined
    return row ? mapCall(row) : null
  },

  applyProcessing(
    id: string,
    input: {
      transcript: string
      rawTranscript: string | null
      extracted: ExtractedCallFields
      recordingStatus: RecordingStatus
      recordingPath: string | null
      recordingMimeType: string | null
    }
  ): CallRecord {
    const existing = this.getById(id)
    if (!existing) throw new Error(`Call ${id} not found.`)

    db.prepare(`
      UPDATE calls
      SET
        caller_name = ?,
        company = ?,
        callback_number = ?,
        intent = ?,
        urgency = ?,
        summary = ?,
        transcript = ?,
        raw_transcript = ?,
        recording_status = ?,
        recording_path = ?,
        recording_mime_type = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.extracted.callerName,
      input.extracted.company,
      input.extracted.callbackNumber,
      input.extracted.intent,
      input.extracted.urgency,
      input.extracted.summary,
      input.transcript,
      input.rawTranscript,
      input.recordingStatus,
      input.recordingPath,
      input.recordingMimeType,
      new Date().toISOString(),
      id
    )

    return this.getById(id)!
  },

  update(
    id: string,
    input: CallUpdateInput,
    reviewerName?: string | null
  ): CallRecord | null {
    const existing = this.getById(id)
    if (!existing) return null

    const nextStatus = input.status ?? existing.status
    const isFirstReview = !existing.reviewedAt && nextStatus !== 'new'
    const reviewedAt = isFirstReview
      ? new Date().toISOString()
      : existing.reviewedAt
    // Attribute the first review to the operator who performed it.
    const reviewedBy = isFirstReview
      ? reviewerName ?? existing.reviewedBy
      : existing.reviewedBy

    db.prepare(`
      UPDATE calls
      SET
        caller_name = ?,
        company = ?,
        callback_number = ?,
        intent = ?,
        urgency = ?,
        summary = ?,
        status = ?,
        assigned_queue = ?,
        reviewed_at = ?,
        reviewed_by = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      input.callerName ?? existing.callerName,
      input.company ?? existing.company,
      input.callbackNumber ?? existing.callbackNumber,
      input.intent ?? existing.intent,
      input.urgency ?? existing.urgency,
      input.summary ?? existing.summary,
      nextStatus,
      input.assignedQueue ?? existing.assignedQueue,
      reviewedAt,
      reviewedBy,
      new Date().toISOString(),
      id
    )

    return this.getById(id)
  },

  /** Reassign every call in a mailbox (used when a mailbox is deleted). */
  reassignMailbox(fromMailboxId: string, toMailboxId: string | null): void {
    db.prepare(
      'UPDATE calls SET mailbox_id = ?, updated_at = ? WHERE mailbox_id = ?'
    ).run(toMailboxId, new Date().toISOString(), fromMailboxId)
  },

  markSynced(
    id: string,
    input: { ticketId: string; provider: string }
  ): CallRecord | null {
    const existing = this.getById(id)
    if (!existing) return null

    db.prepare(`
      UPDATE calls
      SET synced_ticket_id = ?, synced_ticket_provider = ?, synced_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.ticketId,
      input.provider,
      new Date().toISOString(),
      new Date().toISOString(),
      id
    )

    return this.getById(id)
  },

  wasEmailNotified(id: string): boolean {
    const row = db
      .prepare('SELECT email_notified_at FROM calls WHERE id = ?')
      .get(id) as { email_notified_at: string | null } | undefined
    return Boolean(row?.email_notified_at)
  },

  markEmailNotified(id: string): void {
    db.prepare(
      'UPDATE calls SET email_notified_at = ?, updated_at = ? WHERE id = ?'
    ).run(new Date().toISOString(), new Date().toISOString(), id)
  },
}
