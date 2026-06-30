import { randomUUID } from 'node:crypto'
import { UsageLine, UsageType } from '../../../shared/src/index.js'
import { db } from '../db/client.js'

export const usageRepository = {
  record(input: {
    tenantId: string
    type: UsageType
    quantity: number
    unitCostCents: number
    billedCents: number
    callId?: string | null
  }): void {
    db.prepare(`
      INSERT INTO usage_events (
        id, tenant_id, type, quantity, unit_cost_cents, billed_cents, call_id, created_at
      )
      VALUES (@id, @tenant_id, @type, @quantity, @unit_cost_cents, @billed_cents, @call_id, @created_at)
    `).run({
      id: randomUUID(),
      tenant_id: input.tenantId,
      type: input.type,
      quantity: input.quantity,
      unit_cost_cents: input.unitCostCents,
      billed_cents: input.billedCents,
      call_id: input.callId ?? null,
      created_at: new Date().toISOString(),
    })
  },

  /** Aggregated usage lines for a tenant within a month (YYYY-MM, UTC prefix). */
  linesForMonth(tenantId: string, monthPrefix: string): UsageLine[] {
    const rows = db
      .prepare(`
        SELECT type,
               SUM(quantity) AS quantity,
               SUM(quantity * unit_cost_cents) AS carrier_cents,
               SUM(billed_cents) AS billed_cents
        FROM usage_events
        WHERE tenant_id = ? AND substr(created_at, 1, 7) = ?
        GROUP BY type
      `)
      .all(tenantId, monthPrefix) as {
      type: UsageType
      quantity: number
      carrier_cents: number
      billed_cents: number
    }[]
    return rows.map(row => ({
      type: row.type,
      quantity: row.quantity,
      carrierCents: Math.round(row.carrier_cents),
      billedCents: Math.round(row.billed_cents),
    }))
  },

  /** Total minutes (inbound + outbound) used by a tenant this month. */
  minutesForMonth(tenantId: string, monthPrefix: string): number {
    const row = db
      .prepare(`
        SELECT COALESCE(SUM(quantity), 0) AS minutes
        FROM usage_events
        WHERE tenant_id = ? AND substr(created_at, 1, 7) = ?
          AND type IN ('inbound_minute', 'outbound_minute')
      `)
      .get(tenantId, monthPrefix) as { minutes: number }
    return row.minutes
  },

  /** Sum of billed_cents charged to a tenant (all time) — wallet draw-down. */
  totalBilledCents(tenantId: string): number {
    const row = db
      .prepare(
        'SELECT COALESCE(SUM(billed_cents), 0) AS cents FROM usage_events WHERE tenant_id = ?'
      )
      .get(tenantId) as { cents: number }
    return row.cents
  },
}
