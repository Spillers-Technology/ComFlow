import crypto from 'node:crypto'
import {
  BillingProvider,
  CheckoutSession,
  PaymentEvent,
  ProviderSubscription,
  SubscriptionStatus,
} from './types.js'

const STRIPE_API = 'https://api.stripe.com/v1'

export type StripeConfig = {
  secretKey: string
  webhookSecret: string | null
  successUrl: string
  cancelUrl: string
}

// Stripe's own enum includes a few statuses we don't need to distinguish for
// gating purposes (`incomplete_expired`, `paused`). Map them onto the closest
// status that already drives correct behavior (blocked / dead) rather than
// growing the shared enum for states this product doesn't act on separately.
function normalizeSubscriptionStatus(raw: string): SubscriptionStatus {
  switch (raw) {
    case 'incomplete':
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'unpaid':
    case 'canceled':
      return raw
    case 'incomplete_expired':
      return 'canceled'
    case 'paused':
      return 'unpaid'
    default:
      return 'unpaid'
  }
}

function isUsableStatus(status: SubscriptionStatus): status is 'active' | 'trialing' {
  return status === 'active' || status === 'trialing'
}

function stringId(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' && id ? id : undefined
  }
  return undefined
}

function invoiceSubscriptionId(object: Record<string, unknown>): string | undefined {
  const legacy = stringId(object.subscription)
  if (legacy) return legacy
  const parent = object.parent as
    | {
        type?: string
        subscription_details?: { subscription?: unknown }
      }
    | undefined
  if (parent?.type !== 'subscription_details') return undefined
  return stringId(parent.subscription_details?.subscription)
}

type StripeSubscriptionObject = {
  id: string
  customer: string
  status: string
  cancel_at_period_end?: boolean
  current_period_start?: number
  current_period_end?: number
  canceled_at?: number | null
  metadata?: { tenantId?: string }
  items?: {
    data?: Array<{
      id: string
      current_period_start?: number
      current_period_end?: number
      price?: { id?: string }
    }>
  }
}

function mapSubscription(object: StripeSubscriptionObject): ProviderSubscription {
  const item = object.items?.data?.[0]
  const priceId = item?.price?.id
  const periodStart = object.current_period_start ?? item?.current_period_start
  const periodEnd = object.current_period_end ?? item?.current_period_end
  if (
    !object.id ||
    !object.customer ||
    !object.status ||
    !priceId ||
    !Number.isFinite(periodStart) ||
    !Number.isFinite(periodEnd)
  ) {
    throw new Error(`Stripe subscription ${object.id || '(missing id)'} is incomplete.`)
  }
  return {
    id: object.id,
    customerId: object.customer,
    status: normalizeSubscriptionStatus(object.status),
    priceId,
    // Stripe 2025-03-31.basil moved billing periods from Subscription onto
    // Subscription Item. Accept both shapes so an account/webhook API-version
    // migration cannot silently turn a period into 1970.
    currentPeriodStart: new Date(periodStart! * 1000).toISOString(),
    currentPeriodEnd: new Date(periodEnd! * 1000).toISOString(),
    cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
  }
}

class StripeRequestError extends Error {
  constructor(
    readonly status: number,
    path: string,
    message: string
  ) {
    super(`Stripe ${path} failed: ${message}`)
  }
}

/**
 * Stripe adapter implemented over the REST API with `fetch` and manual webhook
 * signature verification — no SDK dependency. Wallet top-ups use a one-off
 * Checkout session whose metadata carries the tenant id; the webhook credits the
 * wallet only after the session reports paid (including the asynchronous
 * success event). Subscriptions use a recurring Checkout session whose
 * `subscription_data.metadata` propagates the tenant id onto the created
 * subscription object itself, so subscription-lifecycle webhooks (which never
 * carry the originating Checkout session) can still resolve the tenant
 * directly instead of only through the customer id. The adapter has synthetic
 * signed-payload coverage; a real Stripe test-mode lifecycle remains a release
 * gate and is not claimed by this implementation.
 */
export class StripeBillingProvider implements BillingProvider {
  readonly id = 'stripe'

  constructor(private readonly config: StripeConfig) {}

  private async request(
    method: 'POST' | 'GET' | 'DELETE',
    path: string,
    form?: Record<string, string>,
    idempotencyKey?: string
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${STRIPE_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : undefined,
    })
    const body = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const error = body.error as { message?: string } | undefined
      throw new StripeRequestError(
        response.status,
        path,
        error?.message ?? String(response.status)
      )
    }
    return body
  }

  private post(
    path: string,
    form: Record<string, string>,
    idempotencyKey?: string
  ) {
    return this.request('POST', path, form, idempotencyKey)
  }

  private get(path: string) {
    return this.request('GET', path)
  }

  async ensureCustomer(input: {
    tenantId: string
    existingCustomerId: string | null
    email?: string | null
  }): Promise<string> {
    if (input.existingCustomerId) return input.existingCustomerId
    const customer = await this.post('/customers', {
      'metadata[tenantId]': input.tenantId,
      ...(input.email ? { email: input.email } : {}),
    })
    return String(customer.id)
  }

  async createTopUpCheckout(input: {
    tenantId: string
    customerId: string
    amountCents: number
  }): Promise<CheckoutSession> {
    const session = await this.post('/checkout/sessions', {
      mode: 'payment',
      customer: input.customerId,
      success_url: this.config.successUrl,
      cancel_url: this.config.cancelUrl,
      'metadata[tenantId]': input.tenantId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(input.amountCents),
      'line_items[0][price_data][product_data][name]': 'ComFlow wallet top-up',
    })
    return { url: String(session.url), sessionId: String(session.id) }
  }

  async createSubscriptionCheckout(input: {
    tenantId: string
    customerId: string
    priceId: string
    idempotencyKey: string
  }): Promise<CheckoutSession> {
    const session = await this.post(
      '/checkout/sessions',
      {
        mode: 'subscription',
        customer: input.customerId,
        success_url: this.config.successUrl,
        cancel_url: this.config.cancelUrl,
        'metadata[tenantId]': input.tenantId,
        // Propagates onto the Subscription object Stripe creates, so later
        // subscription/invoice webhooks (which don't carry the Checkout session)
        // can resolve the tenant without a customer-id round trip.
        'subscription_data[metadata][tenantId]': input.tenantId,
        'line_items[0][quantity]': '1',
        'line_items[0][price]': input.priceId,
      },
      input.idempotencyKey
    )
    return { url: String(session.url), sessionId: String(session.id) }
  }

  async createBillingPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<{ url: string }> {
    const session = await this.post('/billing_portal/sessions', {
      customer: input.customerId,
      return_url: input.returnUrl,
    })
    return { url: String(session.url) }
  }

  async cancelSubscription(input: {
    subscriptionId: string
    atPeriodEnd: boolean
  }): Promise<void> {
    if (input.atPeriodEnd) {
      await this.post(`/subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
        cancel_at_period_end: 'true',
      })
      return
    }
    await this.request(
      'DELETE',
      `/subscriptions/${encodeURIComponent(input.subscriptionId)}`
    )
  }

  async reactivateSubscription(input: { subscriptionId: string }): Promise<void> {
    await this.post(`/subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
      cancel_at_period_end: 'false',
    })
  }

  async updateSubscriptionPrice(input: {
    subscriptionId: string
    priceId: string
  }): Promise<void> {
    // Changing a subscription's price requires the existing subscription
    // item's id — Stripe has no "just swap the price" shorthand.
    const current = (await this.get(
      `/subscriptions/${encodeURIComponent(input.subscriptionId)}`
    )) as unknown as StripeSubscriptionObject
    const itemId = current.items?.data?.[0]?.id
    if (!itemId) {
      throw new Error(
        `Subscription ${input.subscriptionId} has no item to reprice.`
      )
    }
    await this.post(`/subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
      'items[0][id]': itemId,
      'items[0][price]': input.priceId,
      proration_behavior: 'create_prorations',
    })
  }

  async getSubscription(
    subscriptionId: string
  ): Promise<ProviderSubscription | null> {
    try {
      const object = (await this.get(
        `/subscriptions/${encodeURIComponent(subscriptionId)}`
      )) as unknown as StripeSubscriptionObject
      return mapSubscription(object)
    } catch (error) {
      // Stripe 404s a subscription id that no longer exists (e.g. deleted
      // long enough ago to be pruned) — reconciliation treats that as canceled.
      if (error instanceof StripeRequestError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async listSubscriptionsForCustomer(
    customerId: string
  ): Promise<ProviderSubscription[]> {
    const params = new URLSearchParams({
      customer: customerId,
      status: 'all',
      limit: '10',
    })
    const body = (await this.get(`/subscriptions?${params.toString()}`)) as {
      data?: StripeSubscriptionObject[]
    }
    return (body.data ?? []).map(mapSubscription)
  }

  private normalizedSubscriptionEvent(input: {
    eventId: string
    subscription: ProviderSubscription
    tenantId?: string
    customerId?: string
    paymentFailed?: boolean
  }): PaymentEvent {
    const { subscription } = input
    const base = {
      id: input.eventId,
      tenantId: input.tenantId,
      customerId: input.customerId ?? subscription.customerId,
      subscriptionId: subscription.id,
      status: subscription.status,
      priceId: subscription.priceId,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    }
    if (input.paymentFailed) {
      return { ...base, type: 'subscription_payment_failed' }
    }
    if (subscription.status === 'canceled') {
      return {
        id: input.eventId,
        tenantId: input.tenantId,
        customerId: base.customerId,
        subscriptionId: subscription.id,
        type: 'subscription_canceled',
        canceledAt: new Date().toISOString(),
      }
    }
    if (isUsableStatus(subscription.status)) {
      return { ...base, status: subscription.status, type: 'subscription_active' }
    }
    return { ...base, type: 'subscription_updated' }
  }

  async parseWebhook(input: {
    rawBody: Buffer | string
    signature: string | undefined
  }): Promise<PaymentEvent | null> {
    const raw =
      typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString()
    this.verifySignature(raw, input.signature)

    const event = JSON.parse(raw) as {
      id: string
      type: string
      data: { object: Record<string, unknown> }
    }
    if (!event.id || !event.type || !event.data?.object) {
      throw new Error('Malformed Stripe event payload.')
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const object = event.data.object
      const metadata = (object.metadata ?? {}) as { tenantId?: string }
      if (object.mode === 'subscription') {
        // Delayed payment methods complete Checkout before money settles.
        if (
          event.type === 'checkout.session.completed' &&
          object.payment_status !== 'paid' &&
          object.payment_status !== 'no_payment_required'
        ) {
          return null
        }
        const subscriptionId = stringId(object.subscription)
        const customerId = stringId(object.customer)
        if (!subscriptionId || !customerId) return null
        const subscription = await this.getSubscription(subscriptionId)
        if (!subscription) {
          throw new Error(
            `Stripe Checkout references missing subscription ${subscriptionId}.`
          )
        }
        return this.normalizedSubscriptionEvent({
          eventId: event.id,
          subscription,
          tenantId: metadata.tenantId,
          customerId,
        })
      }

      if (object.mode !== 'payment') return null
      const amountCents = Number(object.amount_total ?? 0)
      // Only settled funds credit the wallet: async payment methods complete
      // the session with payment_status 'unpaid' and settle (or fail) later.
      if (
        event.type === 'checkout.session.completed' &&
        object.payment_status !== 'paid'
      ) {
        return null
      }
      if (!metadata.tenantId || !amountCents) return null

      return {
        id: event.id,
        type: 'payment_succeeded',
        tenantId: metadata.tenantId,
        amountCents,
      }
    }

    if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const object = event.data.object
      if (object.mode !== 'subscription') return null
      const checkoutId = stringId(object.id)
      const metadata = (object.metadata ?? {}) as { tenantId?: string }
      if (!checkoutId) return null
      return {
        id: event.id,
        type: 'subscription_checkout_expired',
        tenantId: metadata.tenantId,
        customerId: stringId(object.customer),
        checkoutId,
      }
    }

    if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object as {
        charge?: string
        amount?: number
      }
      if (!dispute.charge) return null
      // The dispute payload has no customer/metadata; fetch its charge to
      // learn which customer (and therefore tenant) is disputing.
      const charge = await this.get(`/charges/${encodeURIComponent(dispute.charge)}`)
      const customerId = charge.customer ? String(charge.customer) : undefined
      if (!customerId) return null

      return {
        id: event.id,
        type: 'payment_disputed',
        customerId,
        amountCents: Number(dispute.amount ?? 0),
      }
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated'
    ) {
      const object = event.data.object as unknown as StripeSubscriptionObject
      if (!object.id || !object.customer) return null
      // Webhooks are not ordered. Re-fetching makes every delivery converge on
      // current provider state instead of trusting a delayed event snapshot.
      const subscription = await this.getSubscription(object.id)
      if (!subscription) {
        throw new Error(`Stripe subscription ${object.id} was not found.`)
      }
      return this.normalizedSubscriptionEvent({
        eventId: event.id,
        subscription,
        tenantId: object.metadata?.tenantId,
        customerId: object.customer,
      })
    }

    if (event.type === 'customer.subscription.deleted') {
      const object = event.data.object as unknown as StripeSubscriptionObject
      return {
        id: event.id,
        tenantId: object.metadata?.tenantId,
        customerId: object.customer,
        subscriptionId: object.id,
        type: 'subscription_canceled',
        canceledAt: new Date(
          (object.canceled_at ?? Date.now() / 1000) * 1000
        ).toISOString(),
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object
      const subscriptionId = invoiceSubscriptionId(invoice)
      if (!subscriptionId) return null
      const subscription = await this.getSubscription(subscriptionId)
      if (!subscription) {
        throw new Error(`Stripe invoice references missing subscription ${subscriptionId}.`)
      }
      return this.normalizedSubscriptionEvent({
        eventId: event.id,
        subscription,
        customerId: stringId(invoice.customer),
        paymentFailed: true,
      })
    }

    if (
      event.type === 'invoice.paid' ||
      event.type === 'invoice.payment_succeeded'
    ) {
      const invoice = event.data.object
      const subscriptionId = invoiceSubscriptionId(invoice)
      if (!subscriptionId) return null
      const subscription = await this.getSubscription(subscriptionId)
      if (!subscription) {
        throw new Error(`Stripe invoice references missing subscription ${subscriptionId}.`)
      }
      return this.normalizedSubscriptionEvent({
        eventId: event.id,
        subscription,
        customerId: stringId(invoice.customer),
      })
    }

    return null
  }

  private verifySignature(payload: string, header: string | undefined): void {
    if (!this.config.webhookSecret) {
      // Refuse to guess: without the signing secret, any caller could forge
      // wallet credits. Hosted mode must set STRIPE_WEBHOOK_SECRET.
      throw new Error(
        'STRIPE_WEBHOOK_SECRET is not set; refusing to accept unverified webhooks.'
      )
    }
    if (!header) throw new Error('Missing Stripe-Signature header.')

    const entries = header.split(',').map(part => part.trim().split('='))
    const timestamp = entries.find(([key]) => key === 't')?.[1]
    const signatures = entries
      .filter(([key, value]) => key === 'v1' && Boolean(value))
      .map(([, value]) => value!)
    if (!timestamp || signatures.length === 0) {
      throw new Error('Malformed Stripe-Signature.')
    }
    const signedAt = Number(timestamp)
    const nowSeconds = Math.floor(Date.now() / 1000)
    if (!Number.isInteger(signedAt) || Math.abs(nowSeconds - signedAt) > 300) {
      throw new Error('Stale Stripe webhook signature.')
    }

    const expected = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest('hex')

    const valid = signatures.some(signature => {
      if (signature.length !== expected.length) return false
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    })
    if (!valid) {
      throw new Error('Invalid Stripe webhook signature.')
    }
  }
}
