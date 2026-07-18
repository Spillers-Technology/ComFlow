import { db } from '../db/client.js'

export type TenantBilling = {
  stripeCustomerId: string | null
  subscriptionId: string | null
  plan: string | null
  creditCents: number
}

type BillingRow = {
  tenant_id: string
  stripe_customer_id: string | null
  subscription_id: string | null
  plan: string | null
  credit_cents: number
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
