import { db } from '../db/client.js'

export type BillingAlert = {
  eventId: string
  tenantId: string
  tenantName: string
  reason: string
  attempts: number
  lastError: string | null
  createdAt: string
  sentAt: string | null
}

type BillingAlertRow = {
  event_id: string
  tenant_id: string
  tenant_name: string
  reason: string
  attempts: number
  last_error: string | null
  created_at: string
  sent_at: string | null
}

function mapRow(row: BillingAlertRow): BillingAlert {
  return {
    eventId: row.event_id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    reason: row.reason,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  }
}

export const billingAlertRepository = {
  enqueue(input: {
    eventId: string
    tenantId: string
    tenantName: string
    reason: string
  }): void {
    db.prepare(`
      INSERT INTO billing_alert_outbox (
        event_id, tenant_id, tenant_name, reason, created_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO NOTHING
    `).run(
      input.eventId,
      input.tenantId,
      input.tenantName,
      input.reason,
      new Date().toISOString()
    )
  },

  pending(limit = 25): BillingAlert[] {
    const rows = db
      .prepare(`
        SELECT * FROM billing_alert_outbox
        WHERE sent_at IS NULL
        ORDER BY datetime(created_at) ASC
        LIMIT ?
      `)
      .all(limit) as BillingAlertRow[]
    return rows.map(mapRow)
  },

  markSent(eventId: string): void {
    db.prepare(`
      UPDATE billing_alert_outbox
      SET attempts = attempts + 1, last_error = NULL, sent_at = ?
      WHERE event_id = ?
    `).run(new Date().toISOString(), eventId)
  },

  markFailed(eventId: string, error: string): void {
    db.prepare(`
      UPDATE billing_alert_outbox
      SET attempts = attempts + 1, last_error = ?
      WHERE event_id = ?
    `).run(error.slice(0, 1000), eventId)
  },

  get(eventId: string): BillingAlert | null {
    const row = db
      .prepare('SELECT * FROM billing_alert_outbox WHERE event_id = ?')
      .get(eventId) as BillingAlertRow | undefined
    return row ? mapRow(row) : null
  },
}
