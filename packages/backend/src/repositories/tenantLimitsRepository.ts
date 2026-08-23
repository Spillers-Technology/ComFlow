import { TenantLimits, TenantLimitsSchema } from '../../../shared/src/index.js'
import { config } from '../config.js'
import { db } from '../db/client.js'

type LimitsRow = {
  tenant_id: string
  max_concurrent_calls: number
  max_dids: number
  included_minutes: number
  markup_bps: number
  outbound_enabled: number
  updated_at: string
}

/**
 * The plan-derived half of a tenant's limits. Plan bands and config defaults
 * supply exactly these; outboundEnabled is not plan-derived, which is why
 * materialize takes this rather than a full TenantLimits.
 */
type PlanLimits = Omit<TenantLimits, 'outboundEnabled'>

function mapRow(row: LimitsRow): TenantLimits {
  return {
    maxConcurrentCalls: row.max_concurrent_calls,
    maxDids: row.max_dids,
    includedMinutes: row.included_minutes,
    markupBps: row.markup_bps,
    outboundEnabled: Boolean(row.outbound_enabled),
  }
}

export const tenantLimitsRepository = {
  /**
   * Write a tenant's plan limits. Deliberately leaves outbound_enabled alone:
   * this runs on every subscription webhook, and the outbound grant is an
   * operator decision that must survive an upgrade, downgrade, or renewal.
   * Use setOutboundEnabled to change it.
   */
  materialize(tenantId: string, limits: PlanLimits): TenantLimits {
    const value = TenantLimitsSchema.parse({ ...limits, outboundEnabled: false })
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO tenant_limits (
        tenant_id, max_concurrent_calls, max_dids, included_minutes, markup_bps,
        outbound_enabled, updated_at
      )
      VALUES (@tenant_id, @max_concurrent_calls, @max_dids, @included_minutes, @markup_bps,
        0, @updated_at)
      ON CONFLICT(tenant_id) DO UPDATE SET
        max_concurrent_calls = excluded.max_concurrent_calls,
        max_dids = excluded.max_dids,
        included_minutes = excluded.included_minutes,
        markup_bps = excluded.markup_bps,
        updated_at = excluded.updated_at
    `).run({
      tenant_id: tenantId,
      max_concurrent_calls: value.maxConcurrentCalls,
      max_dids: value.maxDids,
      included_minutes: value.includedMinutes,
      markup_bps: value.markupBps,
      updated_at: now,
    })
    return this.get(tenantId)
  },

  setOutboundEnabled(tenantId: string, enabled: boolean): TenantLimits {
    this.get(tenantId)
    db.prepare(
      'UPDATE tenant_limits SET outbound_enabled = ?, updated_at = ? WHERE tenant_id = ?'
    ).run(enabled ? 1 : 0, new Date().toISOString(), tenantId)
    return this.get(tenantId)
  },

  materializeSelfRegistrationPlan(tenantId: string, plan: string): TenantLimits {
    if (plan !== config.selfRegistration.plan || plan !== 'solo') {
      throw new Error(`Unsupported self-registration plan: ${plan}`)
    }
    return this.materialize(
      tenantId,
      TenantLimitsSchema.parse(config.selfRegistration.planLimits)
    )
  },

  /** A tenant's limits, lazily seeded from config defaults on first read. */
  get(tenantId: string): TenantLimits {
    const row = db
      .prepare('SELECT * FROM tenant_limits WHERE tenant_id = ?')
      .get(tenantId) as LimitsRow | undefined
    if (row) return mapRow(row)

    const defaults = config.defaultTenantLimits
    const now = new Date().toISOString()
    // outbound_enabled is written explicitly as 0 here. The column's DEFAULT 1
    // exists only to backfill rows that predate the gate; a tenant with no row
    // at all is new, and new tenants must ask for outbound.
    db.prepare(`
      INSERT INTO tenant_limits (
        tenant_id, max_concurrent_calls, max_dids, included_minutes, markup_bps,
        outbound_enabled, updated_at
      )
      VALUES (@tenant_id, @max_concurrent_calls, @max_dids, @included_minutes, @markup_bps,
        0, @updated_at)
      ON CONFLICT(tenant_id) DO NOTHING
    `).run({
      tenant_id: tenantId,
      max_concurrent_calls: defaults.maxConcurrentCalls,
      max_dids: defaults.maxDids,
      included_minutes: defaults.includedMinutes,
      markup_bps: defaults.markupBps,
      updated_at: now,
    })
    return { ...defaults, outboundEnabled: false }
  },

  update(tenantId: string, patch: Partial<TenantLimits>): TenantLimits {
    const current = this.get(tenantId)
    const next = { ...current, ...patch }
    db.prepare(`
      UPDATE tenant_limits
      SET max_concurrent_calls = ?, max_dids = ?, included_minutes = ?, markup_bps = ?,
          outbound_enabled = ?, updated_at = ?
      WHERE tenant_id = ?
    `).run(
      next.maxConcurrentCalls,
      next.maxDids,
      next.includedMinutes,
      next.markupBps,
      next.outboundEnabled ? 1 : 0,
      new Date().toISOString(),
      tenantId
    )
    return next
  },
}
