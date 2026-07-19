import crypto from 'node:crypto'
import { BillingProvider, CheckoutSession, PaymentEvent } from './types.js'

const STRIPE_API = 'https://api.stripe.com/v1'

export type StripeConfig = {
  secretKey: string
  webhookSecret: string | null
  successUrl: string
  cancelUrl: string
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
