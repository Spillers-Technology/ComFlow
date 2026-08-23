import { config } from '../config.js'
import { db } from '../db/client.js'
import { HttpError } from '../lib/errors.js'
import { tenantLimitsRepository } from '../repositories/tenantLimitsRepository.js'

/**
 * Gates on outbound calling, which is where toll fraud actually pays.
 *
 * Four independent checks, deliberately layered so no single mistake opens the
 * door: the tenant must have been granted outbound by an operator, the
 * destination must be in an allowed country, and the tenant must be under both
 * its daily call-count and daily spend ceilings.
 */
export class OutboundGuardService {
  assertAllowed(tenantId: string, destination: string): void {
    this.assertEnabled(tenantId)
    this.assertDestinationAllowed(destination)
    this.assertWithinDailyCaps(tenantId)
  }

  assertEnabled(tenantId: string): void {
    if (!tenantLimitsRepository.get(tenantId).outboundEnabled) {
      throw new HttpError(
        403,
        'Outbound calling is not enabled for this account. Request access and our team will set it up after a short call.'
      )
    }
  }

  /**
   * Only destinations whose country calling code is allowed. Rejects anything
   * that is not a plain E.164-style number, so tricks like embedded separators
   * or SIP URIs cannot smuggle a destination past the prefix check.
   */
  assertDestinationAllowed(destination: string): void {
    const digits = destination.trim().replace(/^\+/, '')
    if (!/^\d{8,15}$/.test(digits)) {
      throw new HttpError(
        400,
        'Enter the destination as a full international number, digits only.'
      )
    }
    const allowed = config.outbound.allowedCallingCodes.some(code =>
      digits.startsWith(code)
    )
    if (!allowed) {
      throw new HttpError(
        403,
        'That destination country is not enabled for outbound calling. Contact support if you need it.'
      )
    }
  }

  assertWithinDailyCaps(tenantId: string): void {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString()

    const { count } = db
      .prepare(`
        SELECT COUNT(*) AS count FROM scheduled_calls
        WHERE tenant_id = ? AND created_at >= ?
      `)
      .get(tenantId, since) as { count: number }
    if (count >= config.outbound.maxPerDay) {
      throw new HttpError(
        429,
        `Outbound is limited to ${config.outbound.maxPerDay} calls per day. Contact support to raise it.`
      )
    }

    const { cents } = db
      .prepare(`
        SELECT COALESCE(SUM(billed_cents), 0) AS cents FROM usage_events
        WHERE tenant_id = ? AND created_at >= ? AND type = 'outbound_minute'
      `)
      .get(tenantId, since) as { cents: number }
    if (cents >= config.outbound.maxSpendPerDayCents) {
      throw new HttpError(
        429,
        `Outbound spending reached the $${(
          config.outbound.maxSpendPerDayCents / 100
        ).toFixed(2)} daily limit. Contact support to raise it.`
      )
    }
  }
}
