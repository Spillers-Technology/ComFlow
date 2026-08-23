import crypto from 'node:crypto'
import { BillingProvider, CheckoutSession, PaymentEvent } from './types.js'

const STRIPE_API = 'https://api.stripe.com/v1'

/** Stripe reports timestamps as epoch seconds; the rest of ComFlow uses ISO. */
function toIsoSeconds(seconds: number | undefined | null): string | null {
  if (!seconds) return null
  return new Date(seconds * 1000).toISOString()
}

export type StripeConfig = {
  secretKey: string
  webhookSecret: string | null
  successUrl: string
  cancelUrl: string
  /** Band -> Stripe Price id, so subscription webhooks can resolve the band. */
  priceIds: Record<string, string | undefined>
}

/**
 * Stripe adapter implemented over the REST API with `fetch` and manual webhook
 * signature verification — no SDK dependency. Wallet top-ups use a one-off
 * Checkout session whose metadata carries the tenant id; the webhook credits the
 * wallet only after the session reports paid (including the asynchronous
 * success event). Validated in Stripe test mode per the onboarding runbook.
 */
export class StripeBillingProvider implements BillingProvider {
  readonly id = 'stripe'

  constructor(private readonly config: StripeConfig) {}

  private async post(
    path: string,
    form: Record<string, string>
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${STRIPE_API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(form).toString(),
    })
    const body = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const error = body.error as { message?: string } | undefined
      throw new Error(`Stripe ${path} failed: ${error?.message ?? response.status}`)
    }
    return body
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
    return { url: String(session.url) }
  }

  async createSubscriptionCheckout(input: {
    tenantId: string
    customerId: string
    band: string
    priceId: string
  }): Promise<CheckoutSession> {
    const session = await this.post('/checkout/sessions', {
      mode: 'subscription',
      customer: input.customerId,
      success_url: this.config.successUrl,
      cancel_url: this.config.cancelUrl,
      'metadata[tenantId]': input.tenantId,
      'metadata[band]': input.band,
      // Mirrored onto the subscription itself: subscription.* webhooks carry the
      // subscription's metadata, not the checkout session's.
      'subscription_data[metadata][tenantId]': input.tenantId,
      'subscription_data[metadata][band]': input.band,
      'line_items[0][quantity]': '1',
      'line_items[0][price]': input.priceId,
    })
    return { url: String(session.url) }
  }

  async createPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<CheckoutSession> {
    const session = await this.post('/billing_portal/sessions', {
      customer: input.customerId,
      return_url: input.returnUrl,
    })
    return { url: String(session.url) }
  }

  async refund(input: {
    chargeId: string
    amountCents?: number
  }): Promise<{ id: string; amountCents: number }> {
    const refund = await this.post('/refunds', {
      charge: input.chargeId,
      ...(input.amountCents ? { amount: String(input.amountCents) } : {}),
    })
    return { id: String(refund.id), amountCents: Number(refund.amount ?? 0) }
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${STRIPE_API}${path}`, {
      headers: { Authorization: `Bearer ${this.config.secretKey}` },
    })
    const body = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const error = body.error as { message?: string } | undefined
      throw new Error(`Stripe ${path} failed: ${error?.message ?? response.status}`)
    }
    return body
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

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const object = event.data.object
      const metadata = (object.metadata ?? {}) as { tenantId?: string }
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
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const object = event.data.object as {
        id?: string
        status?: string
        customer?: string
        current_period_start?: number
        current_period_end?: number
        cancel_at_period_end?: boolean
        metadata?: { tenantId?: string; band?: string }
        items?: { data?: Array<{ price?: { id?: string } }> }
      }
      if (!object.id || !object.status) return null

      // Prefer the price id — it is what the customer is actually being charged
      // for, and it stays correct after a plan change made in the billing
      // portal, which does not rewrite the subscription's metadata.
      const priceId = object.items?.data?.[0]?.price?.id
      const band =
        this.bandForPrice(priceId) ?? object.metadata?.band ?? null

      return {
        id: event.id,
        type: 'subscription_updated',
        tenantId: object.metadata?.tenantId,
        customerId: object.customer ? String(object.customer) : undefined,
        subscription: {
          stripeSubscriptionId: object.id,
          // A deleted subscription may still report 'active' in its payload;
          // the event type is the authoritative signal that it is over.
          status:
            event.type === 'customer.subscription.deleted'
              ? 'canceled'
              : object.status,
          band,
          currentPeriodStart: toIsoSeconds(object.current_period_start),
          currentPeriodEnd: toIsoSeconds(object.current_period_end),
          cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
        },
      }
    }

    // Stripe stops retrying and fires this once the whole retry schedule is
    // exhausted, which is the point at which suspending is proportionate.
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as {
        customer?: string
        next_payment_attempt?: number | null
        subscription?: string
      }
      // Retries remain: the subscription is past_due, which still grants
      // service. Wait for Stripe to give up before acting.
      if (invoice.next_payment_attempt) return null
      if (!invoice.customer) return null

      return {
        id: event.id,
        type: 'subscription_payment_failed',
        customerId: String(invoice.customer),
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
      const charge = await this.get(`/charges/${dispute.charge}`)
      const customerId = charge.customer ? String(charge.customer) : undefined
      if (!customerId) return null

      return {
        id: event.id,
        type: 'payment_disputed',
        customerId,
        amountCents: Number(dispute.amount ?? 0),
      }
    }

    return null
  }

  private bandForPrice(priceId: string | undefined): string | null {
    if (!priceId) return null
    for (const [band, configured] of Object.entries(this.config.priceIds)) {
      if (configured && configured === priceId) return band
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
