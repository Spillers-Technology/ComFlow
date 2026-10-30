/**
 * A billing provider that collects money (Stripe) and reports payment events.
 * ComFlow runs one provider account. A recurring subscription grants a plan's
 * DID and included minutes directly; a per-tenant prepaid wallet remains only
 * for usage overage once the included allowance is exhausted. A `fake` adapter
 * backs dev/tests with no network calls.
 */
export type CheckoutSession = {
  url: string
  // The provider's checkout session id. Wallet top-ups don't need it (the
  // durable guard there is amount/lifetime based); subscription checkout uses
  // it as the durable pending-checkout guard's reservation key.
  sessionId?: string
}

export type SubscriptionStatus =
  | 'incomplete'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'canceled'

/** A fresh, provider-side read of one subscription — the reconciliation source of truth. */
export type ProviderSubscription = {
  id: string
  customerId: string
  status: SubscriptionStatus
  priceId: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

type SubscriptionEventCore = {
  // Provider event id, used for idempotency.
  id: string
  // Real Stripe subscription/invoice events always carry the customer id;
  // metadata carrying the tenant id directly is a fake-provider convenience.
  tenantId?: string
  customerId?: string
  subscriptionId: string
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
  | (SubscriptionEventCore & {
      // The subscription is (newly, or still) active/trialing — the state
      // that unlocks the plan's DID and included minutes without a wallet
      // payment. Emitted from checkout completion and from
      // customer.subscription.created/updated/invoice.paid when the resulting
      // status is active or trialing.
      type: 'subscription_active'
      status: 'active' | 'trialing'
      priceId: string
      currentPeriodStart: string
      currentPeriodEnd: string
      cancelAtPeriodEnd: boolean
    })
  | (SubscriptionEventCore & {
      // The subscription moved to a non-terminal, non-active status (e.g. a
      // dunning grace period) or its cancel-at-period-end flag toggled while
      // otherwise unchanged.
      type: 'subscription_updated'
      status: SubscriptionStatus
      priceId: string
      currentPeriodStart: string
      currentPeriodEnd: string
      cancelAtPeriodEnd: boolean
    })
  | (SubscriptionEventCore & {
      // An invoice failed to collect. Distinct from `subscription_updated`
      // because Stripe fires it even when the subscription's own status
      // hasn't yet flipped, and it's the signal worth alerting/auditing on.
      type: 'subscription_payment_failed'
      status: SubscriptionStatus
      priceId: string
      currentPeriodStart: string
      currentPeriodEnd: string
      cancelAtPeriodEnd: boolean
    })
  | (SubscriptionEventCore & {
      // Terminal: the subscription is gone (deleted, or immediately canceled).
      type: 'subscription_canceled'
      canceledAt: string
    })
  | {
      id: string
      type: 'subscription_checkout_expired'
      tenantId?: string
      customerId?: string
      checkoutId: string
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

  /** A hosted Checkout session to start a recurring subscription to `priceId`. */
  createSubscriptionCheckout(input: {
    tenantId: string
    customerId: string
    priceId: string
    idempotencyKey: string
  }): Promise<CheckoutSession>

  /** A Billing Portal session so a customer can manage payment method/invoices. */
  createBillingPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<{ url: string }>

  /** Cancel now, or schedule cancellation for the end of the current period. */
  cancelSubscription(input: {
    subscriptionId: string
    atPeriodEnd: boolean
  }): Promise<void>

  /** Undo a scheduled cancel-at-period-end. */
  reactivateSubscription(input: { subscriptionId: string }): Promise<void>

  /** Change which price a subscription bills. */
  updateSubscriptionPrice(input: {
    subscriptionId: string
    priceId: string
  }): Promise<void>

  /**
   * A fresh provider-side read, used to reconcile local state after a missed
   * or delayed webhook. Null if the subscription no longer exists upstream.
   */
  getSubscription(subscriptionId: string): Promise<ProviderSubscription | null>

  /**
   * Every subscription a customer has upstream, newest first. Reconciliation
   * falls back to this when ComFlow never learned a subscription id at all —
   * the case where the webhook that would have recorded it was the one that
   * got missed or delayed, not merely stale.
   */
  listSubscriptionsForCustomer(customerId: string): Promise<ProviderSubscription[]>

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
