import { randomUUID } from 'node:crypto'
import {
  BillingProvider,
  CheckoutSession,
  PaymentEvent,
  ProviderSubscription,
  SubscriptionStatus,
} from './types.js'

type FakeSubscription = {
  id: string
  tenantId: string
  customerId: string
  priceId: string
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

/**
 * In-memory billing provider for dev and tests. Checkout returns a local URL and
 * does not move money; tests credit wallets (or activate/transition
 * subscriptions) by posting a synthetic webhook whose body carries the event
 * fields directly. No signature is required.
 *
 * Subscriptions are also tracked in an in-memory map so `getSubscription` (the
 * reconciliation read) has somewhere real to read from, and so tests can
 * simulate a missed/delayed webhook by mutating that map directly — see
 * `setSubscriptionStateForTesting` — without going through `parseWebhook`.
 */
export class FakeBillingProvider implements BillingProvider {
  readonly id = 'fake'

  private subscriptions = new Map<string, FakeSubscription>()

  async ensureCustomer(input: {
    tenantId: string
    existingCustomerId: string | null
  }): Promise<string> {
    return input.existingCustomerId ?? `fake_cus_${input.tenantId}`
  }

  async createTopUpCheckout(input: {
    tenantId: string
    customerId: string
    amountCents: number
  }): Promise<CheckoutSession> {
    return {
      url: `https://fake.checkout/local?tenant=${input.tenantId}&amount=${input.amountCents}`,
      sessionId: `fake_cs_${randomUUID()}`,
    }
  }

  async createSubscriptionCheckout(input: {
    tenantId: string
    customerId: string
    priceId: string
    idempotencyKey: string
  }): Promise<CheckoutSession> {
    void input.idempotencyKey
    return {
      url: `https://fake.checkout/local?tenant=${input.tenantId}&price=${input.priceId}&mode=subscription`,
      sessionId: `fake_cs_${randomUUID()}`,
    }
  }

  async createBillingPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<{ url: string }> {
    return {
      url: `https://fake.portal/local?customer=${input.customerId}&return=${encodeURIComponent(input.returnUrl)}`,
    }
  }

  async cancelSubscription(input: {
    subscriptionId: string
    atPeriodEnd: boolean
  }): Promise<void> {
    const subscription = this.subscriptions.get(input.subscriptionId)
    if (!subscription) {
      throw new Error(`Fake subscription ${input.subscriptionId} was not found.`)
    }
    if (input.atPeriodEnd) {
      subscription.cancelAtPeriodEnd = true
    } else {
      subscription.status = 'canceled'
      subscription.cancelAtPeriodEnd = false
    }
  }

  async reactivateSubscription(input: { subscriptionId: string }): Promise<void> {
    const subscription = this.subscriptions.get(input.subscriptionId)
    if (!subscription) {
      throw new Error(`Fake subscription ${input.subscriptionId} was not found.`)
    }
    subscription.cancelAtPeriodEnd = false
  }

  async updateSubscriptionPrice(input: {
    subscriptionId: string
    priceId: string
  }): Promise<void> {
    const subscription = this.subscriptions.get(input.subscriptionId)
    if (!subscription) {
      throw new Error(`Fake subscription ${input.subscriptionId} was not found.`)
    }
    subscription.priceId = input.priceId
  }

  async getSubscription(
    subscriptionId: string
  ): Promise<ProviderSubscription | null> {
    const subscription = this.subscriptions.get(subscriptionId)
    if (!subscription) return null
    return {
      id: subscription.id,
      customerId: subscription.customerId,
      status: subscription.status,
      priceId: subscription.priceId,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    }
  }

  async listSubscriptionsForCustomer(
    customerId: string
  ): Promise<ProviderSubscription[]> {
    return [...this.subscriptions.values()]
      .filter(subscription => subscription.customerId === customerId)
      .map(subscription => ({
        id: subscription.id,
        customerId: subscription.customerId,
        status: subscription.status,
        priceId: subscription.priceId,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      }))
  }

  /**
   * Test/dev-only: mutate a subscription's provider-side state directly,
   * without emitting a webhook or touching local ComFlow state. Simulates a
   * missed/delayed Stripe webhook so `SubscriptionService.reconcile` has real
   * drift to repair. Creates the record if it doesn't exist yet.
   */
  setSubscriptionStateForTesting(
    subscriptionId: string,
    patch: Partial<FakeSubscription> & {
      tenantId: string
      customerId: string
    }
  ): void {
    const existing = this.subscriptions.get(subscriptionId)
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      priceId: 'local_price_solo',
      status: 'active',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + MONTH_MS).toISOString(),
      cancelAtPeriodEnd: false,
      ...existing,
      ...patch,
    })
  }

  async parseWebhook(input: {
    rawBody: Buffer | string
    signature: string | undefined
  }): Promise<PaymentEvent | null> {
    void input.signature
    const body = JSON.parse(
      typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString()
    ) as {
      type?: string
      tenantId?: string
      customerId?: string
      amountCents?: number
      id?: string
      subscriptionId?: string
      priceId?: string
      status?: SubscriptionStatus
      currentPeriodStart?: string
      currentPeriodEnd?: string
      cancelAtPeriodEnd?: boolean
      canceledAt?: string
      checkoutId?: string
    }

    if (body.type === 'payment_succeeded' && body.tenantId && body.amountCents) {
      return {
        id: body.id ?? randomUUID(),
        type: 'payment_succeeded',
        tenantId: body.tenantId,
        amountCents: body.amountCents,
      }
    }

    if (body.type === 'payment_disputed' && body.tenantId) {
      return {
        id: body.id ?? randomUUID(),
        type: 'payment_disputed',
        tenantId: body.tenantId,
        amountCents: body.amountCents ?? 0,
      }
    }

    if (body.type === 'subscription_active') {
      if (!body.subscriptionId || (!body.tenantId && !body.customerId)) return null
      const customerId =
        body.customerId ??
        this.subscriptions.get(body.subscriptionId)?.customerId ??
        `fake_cus_${body.tenantId}`
      const status: 'active' | 'trialing' =
        body.status === 'trialing' ? 'trialing' : 'active'
      const currentPeriodStart = body.currentPeriodStart ?? new Date().toISOString()
      const currentPeriodEnd =
        body.currentPeriodEnd ?? new Date(Date.now() + MONTH_MS).toISOString()
      const priceId = body.priceId ?? 'local_price_solo'
      const cancelAtPeriodEnd = body.cancelAtPeriodEnd ?? false
      this.subscriptions.set(body.subscriptionId, {
        id: body.subscriptionId,
        tenantId: body.tenantId ?? '',
        customerId,
        priceId,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      })
      return {
        id: body.id ?? randomUUID(),
        type: 'subscription_active',
        tenantId: body.tenantId,
        customerId,
        subscriptionId: body.subscriptionId,
        status,
        priceId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      }
    }

    if (body.type === 'subscription_updated') {
      if (!body.subscriptionId || (!body.tenantId && !body.customerId)) return null
      const existing = this.subscriptions.get(body.subscriptionId)
      const customerId = body.customerId ?? existing?.customerId ?? `fake_cus_${body.tenantId}`
      const status = body.status ?? existing?.status ?? 'past_due'
      const currentPeriodStart =
        body.currentPeriodStart ?? existing?.currentPeriodStart ?? new Date().toISOString()
      const currentPeriodEnd =
        body.currentPeriodEnd ?? existing?.currentPeriodEnd ?? new Date(Date.now() + MONTH_MS).toISOString()
      const priceId = body.priceId ?? existing?.priceId ?? 'local_price_solo'
      const cancelAtPeriodEnd = body.cancelAtPeriodEnd ?? existing?.cancelAtPeriodEnd ?? false
      this.subscriptions.set(body.subscriptionId, {
        id: body.subscriptionId,
        tenantId: body.tenantId ?? existing?.tenantId ?? '',
        customerId,
        priceId,
        status,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      })
      return {
        id: body.id ?? randomUUID(),
        type: 'subscription_updated',
        tenantId: body.tenantId,
        customerId,
        subscriptionId: body.subscriptionId,
        status,
        priceId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      }
    }

    if (body.type === 'subscription_payment_failed') {
      if (!body.subscriptionId || (!body.tenantId && !body.customerId)) return null
      const existing = this.subscriptions.get(body.subscriptionId)
      const customerId =
        body.customerId ?? existing?.customerId ?? `fake_cus_${body.tenantId}`
      const status = body.status ?? 'past_due'
      const priceId = body.priceId ?? existing?.priceId ?? 'local_price_solo'
      const currentPeriodStart =
        body.currentPeriodStart ?? existing?.currentPeriodStart ?? new Date().toISOString()
      const currentPeriodEnd =
        body.currentPeriodEnd ??
        existing?.currentPeriodEnd ??
        new Date(Date.now() + MONTH_MS).toISOString()
      const cancelAtPeriodEnd =
        body.cancelAtPeriodEnd ?? existing?.cancelAtPeriodEnd ?? false
      this.subscriptions.set(body.subscriptionId, {
        id: body.subscriptionId,
        tenantId: body.tenantId ?? existing?.tenantId ?? '',
        customerId,
        status,
        priceId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      })
      return {
        id: body.id ?? randomUUID(),
        type: 'subscription_payment_failed',
        tenantId: body.tenantId,
        customerId,
        subscriptionId: body.subscriptionId,
        status,
        priceId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
      }
    }

    if (body.type === 'subscription_checkout_expired') {
      if (!body.checkoutId || (!body.tenantId && !body.customerId)) return null
      return {
        id: body.id ?? randomUUID(),
        type: 'subscription_checkout_expired',
        tenantId: body.tenantId,
        customerId: body.customerId,
        checkoutId: body.checkoutId,
      }
    }

    if (body.type === 'subscription_canceled') {
      if (!body.subscriptionId || (!body.tenantId && !body.customerId)) return null
      const existing = this.subscriptions.get(body.subscriptionId)
      if (existing) {
        existing.status = 'canceled'
        existing.cancelAtPeriodEnd = false
      }
      return {
        id: body.id ?? randomUUID(),
        type: 'subscription_canceled',
        tenantId: body.tenantId,
        customerId: body.customerId,
        subscriptionId: body.subscriptionId,
        canceledAt: body.canceledAt ?? new Date().toISOString(),
      }
    }

    return null
  }
}
