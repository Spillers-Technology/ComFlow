/**
 * A billing provider that collects money (Stripe) and reports payment events.
 * ComFlow runs one provider account; payments credit a per-tenant prepaid wallet
 * that usage draws down. A `fake` adapter backs dev/tests with no network calls.
 */
export type CheckoutSession = { url: string }

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
