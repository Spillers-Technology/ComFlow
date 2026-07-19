/**
 * A billing provider that collects money (Stripe) and reports payment events.
 * ComFlow runs one provider account; payments credit a per-tenant prepaid wallet
 * that usage draws down. A `fake` adapter backs dev/tests with no network calls.
 */
export type CheckoutSession = { url: string }

/** The subscription state a provider webhook reports. */
export type SubscriptionSnapshot = {
  stripeSubscriptionId: string
  /** Stripe's status string; the service decides what grants service. */
  status: string
  /** The band, resolved from the subscription's price id. */
  band: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

/** A normalized payment event parsed from a provider webhook. */
export type PaymentEvent =
  | {
      // Provider event id, used for idempotency.
      id: string
      // Settled funds only — checkout sessions that completed unpaid never
      // produce this event.
      type: 'payment_succeeded'
      tenantId: string
      amountCents: number
    }
  | {
      id: string
      // A chargeback/dispute was opened; the tenant gets frozen. Dispute
      // webhooks may only carry the provider customer id, so either identifier
      // is allowed and the service resolves the tenant.
      type: 'payment_disputed'
      tenantId?: string
      customerId?: string
      amountCents: number
    }
  | {
      id: string
      // A subscription was created, changed band, renewed, or ended. Carries the
      // full state rather than a delta, so handling is idempotent by nature.
      type: 'subscription_updated'
      tenantId?: string
      customerId?: string
      subscription: SubscriptionSnapshot
    }
  | {
      id: string
      // An invoice failed after Stripe's retries were exhausted. Distinct from a
      // single failed charge, which only moves the subscription to past_due.
      type: 'subscription_payment_failed'
      tenantId?: string
      customerId?: string
    }

export interface BillingProvider {
  readonly id: string

  /** Create (or return) the provider customer for a tenant. */
  ensureCustomer(input: {
    tenantId: string
    existingCustomerId: string | null
    email?: string | null
  }): Promise<string>

  /** A hosted Checkout session to add `amountCents` of wallet credit. */
  createTopUpCheckout(input: {
    tenantId: string
    customerId: string
    amountCents: number
  }): Promise<CheckoutSession>

  /** A hosted Checkout session that starts a recurring subscription to a band. */
  createSubscriptionCheckout(input: {
    tenantId: string
    customerId: string
    band: string
    priceId: string
  }): Promise<CheckoutSession>

  /**
   * A hosted billing-portal session. This is where customers change plan,
   * update their card, and cancel — so ComFlow never handles card details and
   * has no cancellation UI of its own to keep correct.
   */
  createPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<CheckoutSession>

  /** Refund a charge, in whole or in part. Owner-initiated support action. */
  refund(input: {
    chargeId: string
    amountCents?: number
  }): Promise<{ id: string; amountCents: number }>

  /**
   * Verify + parse a webhook into a normalized payment event, or null if it's a
   * type we don't act on. Throws if the signature is invalid. Async because
   * some events (Stripe disputes) need a follow-up API call to resolve the
   * customer.
   */
  parseWebhook(input: {
    rawBody: Buffer | string
    signature: string | undefined
  }): Promise<PaymentEvent | null>
}
