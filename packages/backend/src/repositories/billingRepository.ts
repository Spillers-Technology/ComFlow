import { db } from '../db/client.js'

export type TenantBilling = {
  stripeCustomerId: string | null
  subscriptionId: string | null
  plan: string | null
  creditCents: number
  pendingTopUpCents: number
  pendingTopUpExpiresAt: string | null
}

type BillingRow = {
  tenant_id: string
  stripe_customer_id: string | null
  subscription_id: string | null
  plan: string | null
  credit_cents: number
  pending_topup_cents: number
  pending_topup_expires_at: string | null
  updated_at: string
}

export const billingRepository = {
  /** A tenant's billing row, lazily created with a zero balance. */
  get(tenantId: string): TenantBilling {
    const row = db
      .prepare('SELECT * FROM tenant_billing WHERE tenant_id = ?')
      .get(tenantId) as BillingRow | undefined
    if (row) {
      return {
        stripeCustomerId: row.stripe_customer_id,
        subscriptionId: row.subscription_id,
        plan: row.plan,
        creditCents: row.credit_cents,
        pendingTopUpCents: row.pending_topup_cents,
        pendingTopUpExpiresAt: row.pending_topup_expires_at,
      }
    }
    db.prepare(`
      INSERT INTO tenant_billing (tenant_id, credit_cents, updated_at)
      VALUES (?, 0, ?)
      ON CONFLICT(tenant_id) DO NOTHING
    `).run(tenantId, new Date().toISOString())
    return {
      stripeCustomerId: null,
      subscriptionId: null,
      plan: null,
      creditCents: 0,
      pendingTopUpCents: 0,
      pendingTopUpExpiresAt: null,
    }
  },

  /** Reverse lookup for provider webhooks that only carry a customer id. */
  tenantIdByCustomer(customerId: string): string | null {
    const row = db
      .prepare('SELECT tenant_id FROM tenant_billing WHERE stripe_customer_id = ?')
      .get(customerId) as { tenant_id: string } | undefined
    return row?.tenant_id ?? null
  },

  setCustomer(tenantId: string, customerId: string): void {
    this.get(tenantId)
    db.prepare(
      'UPDATE tenant_billing SET stripe_customer_id = ?, updated_at = ? WHERE tenant_id = ?'
    ).run(customerId, new Date().toISOString(), tenantId)
  },

  addCredit(tenantId: string, cents: number): void {
    this.get(tenantId)
    db.prepare(
      'UPDATE tenant_billing SET credit_cents = credit_cents + ?, updated_at = ? WHERE tenant_id = ?'
    ).run(cents, new Date().toISOString(), tenantId)
  },

  reserveTopUp(
    tenantId: string,
    cents: number,
    maxLifetimeCreditCents: number
  ): boolean {
    this.get(tenantId)
    const now = new Date()
    const row = db
      .prepare('SELECT * FROM tenant_billing WHERE tenant_id = ?')
      .get(tenantId) as BillingRow
    const pendingExpired =
      row.pending_topup_expires_at !== null &&
      Date.parse(row.pending_topup_expires_at) <= now.getTime()
    const pending = pendingExpired ? 0 : row.pending_topup_cents
    if (row.credit_cents + pending + cents > maxLifetimeCreditCents) {
      if (pendingExpired) {
        db.prepare(`
          UPDATE tenant_billing
          SET pending_topup_cents = 0, pending_topup_expires_at = NULL, updated_at = ?
          WHERE tenant_id = ?
        `).run(now.toISOString(), tenantId)
      }
      return false
    }

    db.prepare(`
      UPDATE tenant_billing
      SET pending_topup_cents = ?, pending_topup_expires_at = ?, updated_at = ?
      WHERE tenant_id = ?
    `).run(
      pending + cents,
      new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      now.toISOString(),
      tenantId
    )
    return true
  },

  releaseTopUpReservation(tenantId: string, cents: number): void {
    this.get(tenantId)
    db.prepare(`
      UPDATE tenant_billing
      SET pending_topup_cents = MAX(0, pending_topup_cents - ?),
          pending_topup_expires_at = CASE
            WHEN pending_topup_cents - ? <= 0 THEN NULL
            ELSE pending_topup_expires_at
          END,
          updated_at = ?
      WHERE tenant_id = ?
    `).run(cents, cents, new Date().toISOString(), tenantId)
  },

  settleTopUp(tenantId: string, cents: number): void {
    this.get(tenantId)
    db.prepare(`
      UPDATE tenant_billing
      SET credit_cents = credit_cents + ?,
          pending_topup_cents = MAX(0, pending_topup_cents - ?),
          pending_topup_expires_at = CASE
            WHEN pending_topup_cents - ? <= 0 THEN NULL
            ELSE pending_topup_expires_at
          END,
          updated_at = ?
      WHERE tenant_id = ?
    `).run(cents, cents, cents, new Date().toISOString(), tenantId)
  },

  /** Record a processed provider event id; returns false if already seen. */
  markEventProcessed(eventId: string): boolean {
    const result = db
      .prepare(
        'INSERT OR IGNORE INTO billing_events (id, created_at) VALUES (?, ?)'
      )
      .run(eventId, new Date().toISOString())
    return result.changes > 0
  },
}
