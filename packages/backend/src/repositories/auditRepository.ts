import { randomUUID } from 'node:crypto'
import { db } from '../db/client.js'

export type AuditEntry = {
  id: string
  // A user id, or a system actor like 'system:billing-webhook'.
  actor: string
  // Dotted action name, e.g. 'tenant.self_register', 'did.provision'.
  action: string
  tenantId: string | null
  detail: Record<string, unknown> | null
  createdAt: string
}

type AuditRow = {
  id: string
  actor: string
  action: string
  tenant_id: string | null
  detail: string | null
  created_at: string
}

function mapRow(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    tenantId: row.tenant_id,
    detail: row.detail ? (JSON.parse(row.detail) as Record<string, unknown>) : null,
    createdAt: row.created_at,
  }
}

export const auditRepository = {
  record(input: {
    actor: string
    action: string
    tenantId?: string | null
    detail?: Record<string, unknown> | null
  }): void {
    db.prepare(`
      INSERT INTO audit_log (id, actor, action, tenant_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      input.actor,
      input.action,
      input.tenantId ?? null,
      input.detail ? JSON.stringify(input.detail) : null,
      new Date().toISOString()
    )
  },

  listByTenant(tenantId: string, limit = 100): AuditEntry[] {
    const rows = db
      .prepare(
        `SELECT * FROM audit_log WHERE tenant_id = ?
         ORDER BY datetime(created_at) DESC LIMIT ?`
      )
      .all(tenantId, limit) as AuditRow[]
    return rows.map(mapRow)
  },

  listRecent(limit = 200): AuditEntry[] {
    const rows = db
      .prepare(
        'SELECT * FROM audit_log ORDER BY datetime(created_at) DESC LIMIT ?'
      )
      .all(limit) as AuditRow[]
    return rows.map(mapRow)
  },
}
