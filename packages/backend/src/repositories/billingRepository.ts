import { db } from '../db/client.js'
import { SubscriptionStatus } from '../providers/billing/types.js'

export type TenantBilling = {
  stripeCustomerId: string | null
  subscriptionId: string | null
  plan: string | null
  creditCents: number
  pendingTopUpCents: number
  pendingTopUpExpiresAt: string | null
  subscriptionStatus: SubscriptionStatus | null
  subscriptionPriceId: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  subscriptionGracePeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  pendingCheckoutId: string | null
  pendingCheckoutExpiresAt: string | null
}

type BillingRow = {
  tenant_id: string
  stripe_customer_id: string | null
  subscription_id: string | null
  plan: string | null
  credit_cents: number
  pending_topup_cents: number
  pending_topup_expires_at: string | null
  subscription_status: SubscriptionStatus | null
  subscription_price_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  subscription_grace_period_end: string | null
  cancel_at_period_end: number
  pending_checkout_id: string | null
  pending_checkout_expires_at: string | null
  updated_at: string
}

function mapRow(row: BillingRow): TenantBilling {
  return {
    stripeCustomerId: row.stripe_customer_id,
    subscriptionId: row.subscription_id,
    plan: row.plan,
    creditCents: row.credit_cents,
    pendingTopUpCents: row.pending_topup_cents,
    pendingTopUpExpiresAt: row.pending_topup_expires_at,
    subscriptionStatus: row.subscription_status,
    subscriptionPriceId: row.subscription_price_id,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    subscriptionGracePeriodEnd: row.subscription_grace_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    pendingCheckoutId: row.pending_checkout_id,
    pendingCheckoutExpiresAt: row.pending_checkout_expires_at,
  }
}

const EMPTY: TenantBilling = {
  stripeCustomerId: null,
  subscriptionId: null,
  plan: null,
  creditCents: 0,
  pendingTopUpCents: 0,
  pendingTopUpExpiresAt: null,
  subscriptionStatus: null,
  subscriptionPriceId: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  subscriptionGracePeriodEnd: null,
  cancelAtPeriodEnd: false,
  pendingCheckoutId: null,
  pendingCheckoutExpiresAt: null,
}

export const billingRepository = {
  /** A tenant's billing row, lazily created with a zero balance. */
  get(tenantId: string): TenantBilling {
    const row = db
      .prepare('SELECT * FROM tenant_billing WHERE tenant_id = ?')
      .get(tenantId) as BillingRow | undefined
    if (row) return mapRow(row)

    db.prepare(`
      INSERT INTO tenant_billing (tenant_id, credit_cents, updated_at)
      VALUES (?, 0, ?)
      ON CONFLICT(tenant_id) DO NOTHING
    `).run(tenantId, new Date().toISOString())
    return { ...EMPTY }
  },

  /** Reverse lookup for provider webhooks that only carry a customer id. */
  tenantIdByCustomer(customerId: string): string | null {
    const row = db
      .prepare('SELECT tenant_id FROM tenant_billing WHERE stripe_customer_id = ?')
      .get(customerId) as { tenant_id: string } | undefined
    return row?.tenant_id ?? null
  },

  /** Reverse lookup used to reject stale/cross-tenant subscription events. */
  tenantIdBySubscription(subscriptionId: string): string | null {
    const row = db
      .prepare('SELECT tenant_id FROM tenant_billing WHERE subscription_id = ?')
      .get(subscriptionId) as { tenant_id: string } | undefined
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

  // --- Subscription lifecycle ----------------------------------------------

  /**
   * Durable guard: reserve a pending Checkout session so a tenant cannot open
   * a second concurrent subscription Checkout. Returns false if an unexpired
   * reservation already exists. Mirrors `reserveTopUp`'s expiring-reservation
   * shape (24h, matching Stripe Checkout's own default session lifetime).
   */
  reserveSubscriptionCheckout(
    tenantId: string,
    checkoutId: string
  ): 'reserved' | 'already_subscribed' | 'checkout_pending' {
    this.get(tenantId)
    const now = new Date()
    // One conditional UPDATE is the lock acquisition. It stays atomic across
    // application processes sharing SQLite, unlike SELECT-then-UPDATE.
    const result = db.prepare(`
      UPDATE tenant_billing
      SET pending_checkout_id = ?, pending_checkout_expires_at = ?, updated_at = ?
      WHERE tenant_id = ?
        AND (subscription_id IS NULL OR subscription_status = 'canceled')
        AND (
          pending_checkout_id IS NULL OR
          pending_checkout_expires_at IS NULL OR
          datetime(pending_checkout_expires_at) <= datetime(?)
        )
    `).run(
      checkoutId,
      new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      now.toISOString(),
      tenantId,
      now.toISOString()
    )
    if (result.changes > 0) return 'reserved'

    const row = db
      .prepare('SELECT * FROM tenant_billing WHERE tenant_id = ?')
      .get(tenantId) as BillingRow
    if (row.subscription_id && row.subscription_status !== 'canceled') {
      return 'already_subscribed'
    }
    return 'checkout_pending'
  },

  /** Replace our durable reservation key with the provider Checkout id. */
  bindSubscriptionCheckout(
    tenantId: string,
    reservationId: string,
    checkoutId: string
  ): boolean {
    const result = db.prepare(`
      UPDATE tenant_billing
      SET pending_checkout_id = ?, updated_at = ?
      WHERE tenant_id = ? AND pending_checkout_id = ?
    `).run(checkoutId, new Date().toISOString(), tenantId, reservationId)
    return result.changes > 0
  },

  /** Release a pending-checkout reservation, but only if it's still the one named. */
  releaseSubscriptionCheckoutReservation(
    tenantId: string,
    checkoutId?: string
  ): void {
    this.get(tenantId)
    db.prepare(`
      UPDATE tenant_billing
      SET pending_checkout_id = NULL, pending_checkout_expires_at = NULL, updated_at = ?
      WHERE tenant_id = ? AND (? IS NULL OR pending_checkout_id = ?)
    `).run(new Date().toISOString(), tenantId, checkoutId ?? null, checkoutId ?? null)
  },

  /** Upsert full subscription state — the shape every subscription webhook and reconciliation converges onto. */
  setSubscriptionState(
    tenantId: string,
    state: {
      subscriptionId: string
      plan: string | null
      status: SubscriptionStatus
      priceId: string
      currentPeriodStart: string
      currentPeriodEnd: string
      gracePeriodEnd: string | null
      cancelAtPeriodEnd: boolean
    }
  ): void {
    this.get(tenantId)
    db.prepare(`
      UPDATE tenant_billing
      SET subscription_id = ?,
          plan = ?,
          subscription_status = ?,
          subscription_price_id = ?,
          current_period_start = ?,
          current_period_end = ?,
          subscription_grace_period_end = ?,
          cancel_at_period_end = ?,
          pending_checkout_id = NULL,
          pending_checkout_expires_at = NULL,
          updated_at = ?
      WHERE tenant_id = ?
    `).run(
      state.subscriptionId,
      state.plan,
      state.status,
      state.priceId,
      state.currentPeriodStart,
      state.currentPeriodEnd,
      state.gracePeriodEnd,
      state.cancelAtPeriodEnd ? 1 : 0,
      new Date().toISOString(),
      tenantId
    )
  },

  /** Mark the subscription payment-failed (status only; the plan/period stay put). */
  markSubscriptionPaymentFailed(
    tenantId: string,
    state: {
      subscriptionId: string
      plan: string | null
      status: SubscriptionStatus
      priceId: string
      currentPeriodStart: string
      currentPeriodEnd: string
      gracePeriodEnd: string | null
      cancelAtPeriodEnd: boolean
    }
  ): void {
    this.get(tenantId)
    this.setSubscriptionState(tenantId, state)
  },

  /** Mark the subscription terminally canceled. */
  markSubscriptionCanceled(tenantId: string): void {
    this.get(tenantId)
    db.prepare(`
      UPDATE tenant_billing
      SET subscription_status = 'canceled', cancel_at_period_end = 0,
          subscription_grace_period_end = NULL,
          pending_checkout_id = NULL, pending_checkout_expires_at = NULL,
          updated_at = ?
      WHERE tenant_id = ?
    `).run(new Date().toISOString(), tenantId)
  },

  setCancelAtPeriodEnd(tenantId: string, cancelAtPeriodEnd: boolean): void {
    this.get(tenantId)
    db.prepare(`
      UPDATE tenant_billing
      SET cancel_at_period_end = ?, updated_at = ?
      WHERE tenant_id = ?
    `).run(cancelAtPeriodEnd ? 1 : 0, new Date().toISOString(), tenantId)
  },
}
