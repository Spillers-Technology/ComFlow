import { TenantLimits } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { db } from '../db/client.js'

type LimitsRow = {
  tenant_id: string
  max_concurrent_calls: number
  max_dids: number
  included_minutes: number
  markup_bps: number
  updated_at: string
}

function mapRow(row: LimitsRow): TenantLimits {
  return {
    maxConcurrentCalls: row.max_concurrent_calls,
    maxDids: row.max_dids,
    includedMinutes: row.included_minutes,
    markupBps: row.markup_bps,
  }
}

export const tenantLimitsRepository = {
  /** A tenant's limits, lazily seeded from config defaults on first read. */
  get(tenantId: string): TenantLimits {
    const row = db
      .prepare('SELECT * FROM tenant_limits WHERE tenant_id = ?')
      .get(tenantId) as LimitsRow | undefined
    if (row) return mapRow(row)

    const defaults = config.defaultTenantLimits
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO tenant_limits (
        tenant_id, max_concurrent_calls, max_dids, included_minutes, markup_bps, updated_at
      )
      VALUES (@tenant_id, @max_concurrent_calls, @max_dids, @included_minutes, @markup_bps, @updated_at)
      ON CONFLICT(tenant_id) DO NOTHING
    `).run({
      tenant_id: tenantId,
      max_concurrent_calls: defaults.maxConcurrentCalls,
      max_dids: defaults.maxDids,
      included_minutes: defaults.includedMinutes,
      markup_bps: defaults.markupBps,
      updated_at: now,
    })
    return { ...defaults }
  },

  update(tenantId: string, patch: Partial<TenantLimits>): TenantLimits {
    const current = this.get(tenantId)
    const next = { ...current, ...patch }
    db.prepare(`
      UPDATE tenant_limits
      SET max_concurrent_calls = ?, max_dids = ?, included_minutes = ?, markup_bps = ?, updated_at = ?
      WHERE tenant_id = ?
    `).run(
      next.maxConcurrentCalls,
      next.maxDids,
      next.includedMinutes,
      next.markupBps,
      new Date().toISOString(),
      tenantId
    )
    return next
  },
}
